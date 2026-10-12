// Evaluate in Maestro's script engine; YAML selectors only interpolate the result.
output.authEmailPattern = "^" + AUTH_EMAIL.replace(/[.+]/g, "\\$&") + "$";
