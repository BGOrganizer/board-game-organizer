#!/usr/bin/env python3
"""Bounded, opt-in Development-only native capture; never modifies device settings."""
import argparse
import csv
import datetime
import json
import math
import os
from pathlib import Path
import queue
import re
import signal
import subprocess
import threading
import time
import uuid
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
APP = 'com.bgo.boardgameorganizer.dev'


def interrupted(_signum, _frame):
    raise KeyboardInterrupt()


def stop(proc, sig=signal.SIGTERM):
    if proc is not None and proc.poll() is None:
        proc.send_signal(sig)
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)


def parse_metrics(source):
    # Perfetto's CSV does not escape JSON string cells; keep SQL results tabular.
    summaries = csv.DictReader(source.splitlines())
    if summaries.fieldnames != ['metric', 'status', 'samples', 'p50_ms', 'p95_ms']:
        raise RuntimeError('Unexpected trace summary output; inspect summary.csv')
    metrics = []
    for row in summaries:
        if None in row or None in row.values():
            raise RuntimeError('Incomplete trace summary output; inspect summary.csv')
        samples = int(row['samples'])
        if samples < 0:
            raise RuntimeError('Invalid trace sample count')
        statuses = {'ok', 'invalid'} if row['metric'] == 'trace_errors_or_data_loss' else {'measured', 'unavailable'}
        if row['status'] not in statuses:
            raise RuntimeError('Invalid trace metric status')
        if (row['status'] == 'measured' and samples == 0) or (row['status'] == 'unavailable' and samples != 0):
            raise RuntimeError('Inconsistent trace sample count')
        metric = {'metric': row['metric'], 'status': row['status'], 'samples': samples}
        for key in ['p50_ms', 'p95_ms']:
            value = None if row[key] in {'', '[NULL]', 'NULL'} else float(row[key])
            if value is not None and (not math.isfinite(value) or value < 0):
                raise RuntimeError('Invalid trace duration')
            metric[key] = value
        durations = [metric['p50_ms'], metric['p95_ms']]
        if row['status'] == 'unavailable' and any(value is not None for value in durations):
            raise RuntimeError('Unavailable metrics must not invent durations')
        timed = {'frame_completion', 'input_dispatch_to_ack', 'input_to_associated_frame_present'}
        if row['metric'] in timed and row['status'] == 'measured' and None in durations:
            raise RuntimeError('Measured durations must be present')
        if row['metric'] == 'trace_errors_or_data_loss' and row['status'] != ('invalid' if samples else 'ok'):
            raise RuntimeError('Inconsistent trace quality status')
        metrics.append(metric)
    expected = {'trace_errors_or_data_loss', 'frame_completion',
                'frame_timeline_surface_records', 'input_dispatch_to_ack',
                'input_to_associated_frame_present'}
    if len(metrics) != len(expected) or {metric['metric'] for metric in metrics} != expected:
        raise RuntimeError('Missing or duplicate trace metrics; inspect summary.csv')
    return metrics


def capture(args):
    if os.environ.get('PERFETTO_BUILD_ACK') != 'owned-preview-build':
        raise ValueError('Set PERFETTO_BUILD_ACK=owned-preview-build after verifying the installed Development APK/API/account')
    api = os.environ.get('NAVIGATION_API_URL', '')
    if not re.fullmatch(r'https://api-development-pr-[0-9]+-[a-z0-9-]+\.vercel\.app', api):
        raise ValueError('NAVIGATION_API_URL must identify the verified Development preview')
    if not re.fullmatch(r'[A-Za-z0-9._:-]+', args.serial):
        raise ValueError('An explicit ADB serial is required')
    flow = (ROOT / args.flow).resolve()
    if not flow.is_relative_to(ROOT / 'apps/mobile/.maestro/flows') or not flow.is_file():
        raise ValueError('Select an existing project Maestro flow')

    source = flow.read_text()
    if not re.search(r'^appId: ' + re.escape(APP) + r'\s*$', source, re.M) or not re.search(r'^tags:.*\bperformance\b', source, re.M):
        raise ValueError('Use an opt-in performance flow with the fixed Development appId')
    if any(not re.fullmatch(r'[A-Z][A-Z0-9_]*=.*', env) for env in args.env):
        raise ValueError('Flow environment entries must use NAME=value')
    if any(env.split('=', 1)[0] in {'APP_ID', 'NAVIGATION_API_URL', 'NAVIGATION_BUILD_ACK', 'PERFETTO_BUILD_ACK'} for env in args.env):
        raise ValueError('Do not override device/build/API guards through flow arguments')

    def adb(*command):
        return subprocess.check_output(['adb', '-s', args.serial, *command], text=True, timeout=15)

    if adb('get-state').strip() != 'device':
        raise ValueError('The selected device is not authorized')
    if 'mWakefulness=Awake' not in adb('shell', 'dumpsys', 'power'):
        raise ValueError('The selected device must be awake')
    policy = adb('shell', 'dumpsys', 'window', 'policy')
    locked = re.findall(r'\b(?:mShowingLockscreen|mIsShowing|mKeyguardShowing|showing)=(true|false)\b', policy)
    if not locked or 'true' in locked:
        raise ValueError('Unable to verify that the selected device is unlocked')
    windows = adb('shell', 'dumpsys', 'window', 'windows')
    if not re.search(r'mCurrentFocus=[^\n]*\b' + re.escape(APP) + r'/', windows):
        raise ValueError('Open the verified Development app in the foreground')
    if not adb('shell', 'pm', 'path', APP).strip().startswith('package:'):
        raise ValueError('The Development package is not installed')

    os.umask(0o077)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    output = ROOT / 'apps/mobile/build-output/perfetto' / f'{stamp}-{uuid.uuid4().hex[:8]}'
    output.mkdir(parents=True, mode=0o700)
    config = output / 'capture.pbtxt'
    config.write_text('''buffers { size_kb: 16384 fill_policy: RING_BUFFER }
duration_ms: %d
data_sources { config { name: "linux.ftrace" ftrace_config {
 ftrace_events: "sched/sched_switch" ftrace_events: "sched/sched_waking"
 ftrace_events: "power/cpu_frequency" ftrace_events: "power/cpu_idle"
 atrace_categories: "gfx" atrace_categories: "view" atrace_categories: "input"
 atrace_categories: "am" atrace_categories: "wm" atrace_categories: "binder_driver"
 atrace_apps: "%s"
} } }
data_sources { config { name: "linux.process_stats" } }
data_sources { config { name: "android.surfaceflinger.frametimeline" } }
''' % (args.seconds * 1000, APP))
    trace = output / 'capture.pftrace'
    tool = ROOT / 'scripts/performance/perfetto.sh'
    recorder = flow_proc = None
    result = {'flow': str(flow.relative_to(ROOT)), 'serial': args.serial, 'apiUrl': api,
              'captureLimitSeconds': args.seconds, 'status': 'failed'}
    print(f'Private diagnostic output: {output}', flush=True)
    log = (output / 'recorder.log').open('w')
    reader = None
    try:
        recorder = subprocess.Popen(['bash', str(tool), '--record', '-s', args.serial,
            '--no-open', '-c', str(config), '-o', str(trace)],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
            env={**os.environ, 'PYTHONUNBUFFERED': '1'})
        lines = queue.Queue()

        def consume():
            for line in recorder.stdout:
                log.write(line)
                log.flush()
                lines.put(line)
            lines.put(None)

        reader = threading.Thread(target=consume, daemon=True)
        reader.start()
        deadline = time.monotonic() + 25
        while True:
            try:
                line = lines.get(timeout=max(0.01, deadline - time.monotonic()))
            except queue.Empty as error:
                raise RuntimeError('Timed out waiting for recorder readiness') from error
            if line is None:
                raise RuntimeError('Recorder exited before tracing started; inspect recorder.log')
            if 'Trace started.' in line:
                capture_deadline = time.monotonic() + args.seconds - 5
                break
            if time.monotonic() >= deadline:
                raise RuntimeError('Timed out waiting for recorder readiness')
        with (output / 'maestro.log').open('w') as flow_log:
            command = ['bash', str(ROOT / 'scripts/maestro.sh'), '--device', args.serial,
                       'test', '--format', 'junit', '--output', str(output / 'maestro.xml'),
                       '--test-output-dir', str(output / 'maestro'), str(flow)]
            command.extend(['-e', 'NAVIGATION_API_URL=' + api,
                            '-e', 'NAVIGATION_BUILD_ACK=owned-preview-build'])
            for env in args.env:
                command.extend(['-e', env])
            flow_proc = subprocess.Popen(command, cwd=ROOT, stdout=flow_log,
                stderr=subprocess.STDOUT, env={**os.environ, 'ANDROID_SERIAL': args.serial,
                'MAESTRO_OPTS': os.environ.get('MAESTRO_OPTS', '') + ' -Xmx512m -XX:ActiveProcessorCount=2'})
            result['flowExitCode'] = flow_proc.wait(timeout=max(0.1, capture_deadline - time.monotonic()))
            if result['flowExitCode'] != 0:
                raise RuntimeError('Maestro failed; preserved trace and logs remain diagnostic evidence only')
            if recorder.poll() is not None:
                raise RuntimeError('Recorder ended before the flow; the trace does not cover the full journey')
            report = ET.parse(output / 'maestro.xml')
            if not list(report.iter('testcase')) or any(node.tag in {'skipped', 'failure', 'error'} for node in report.iter()):
                raise RuntimeError('Maestro must produce a nonempty report without failures or skips')
        result['status'] = 'flow-completed'
    finally:
        stop(flow_proc)
        stop(recorder, signal.SIGINT)
        if reader is not None:
            reader.join(timeout=5)
        log.close()
        (output / 'capture.json').write_text(json.dumps(result, indent=2) + '\n')
    if not trace.is_file() or trace.stat().st_size == 0:
        raise RuntimeError('Recorder produced no trace')
    analysis = subprocess.run(['bash', str(tool), '-q', str(ROOT / 'scripts/performance/android-summary.sql'),
        str(trace)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=90)
    (output / 'summary.csv').write_text(analysis.stdout)
    (output / 'analysis.log').write_text(analysis.stderr)
    analysis.check_returncode()
    metrics = parse_metrics(analysis.stdout)
    (output / 'summary.json').write_text(json.dumps(metrics, indent=2) + '\n')
    if any(metric['status'] == 'invalid' for metric in metrics):
        raise RuntimeError('Trace has errors or data loss; measurements are invalid')
    if not any(metric['metric'] == 'frame_completion' and metric['status'] == 'measured' for metric in metrics):
        raise RuntimeError('No Development frame samples: native frame measurement is unavailable')
    print(json.dumps(metrics, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--serial', required=True)
    parser.add_argument('--flow', required=True)
    parser.add_argument('--seconds', type=int, choices=range(10, 121), default=30)
    parser.add_argument('-e', '--env', action='append', default=[])
    args = parser.parse_args()
    signal.signal(signal.SIGTERM, interrupted)
    try:
        capture(args)
    except (ValueError, RuntimeError, subprocess.SubprocessError, queue.Empty) as error:
        parser.exit(1, f'{error}\nUse a focused flow that completes within the capture budget.\n')


if __name__ == '__main__':
    main()
