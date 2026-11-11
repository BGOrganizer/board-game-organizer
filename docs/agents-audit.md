# Analisi di AGENTS.md

Data: 11 novembre 2026. Branch: `feat/social-api-refactor`.

Analisi basata sulla skill GitHub [`create-agentsmd`](https://github.com/github/awesome-copilot/tree/main/skills/create-agentsmd),
su [AGENTS.md](../AGENTS.md) e su manifest, codice e workflow correnti. Questo documento propone modifiche:
**AGENTS.md non e stato modificato durante questa attivita**. Le sue modifiche locali preesistenti sono preservate.

## Valutazione

Il documento contiene vincoli importanti, ma mescola istruzioni comuni, contratti di prodotto,
procedure operative e cronologia. Il problema principale non e il numero di righe: e la presenza di
piu descrizioni dello stesso comportamento che possono divergere. Non propongo un limite arbitrario di 100 righe.

## Correggere prima di ridurre

| Priorita | Punto attuale | Riscontro | Intervento proposto |
| --- | --- | --- | --- |
| Alta | Sezione 8, righe 679-701: Registered/Iscritti, amministrazione esclusa, standalone in Available, tavoli Planning e tre chip generalizzate | `eventList.ts`, `event-records.repository.ts`, `Events.tsx`, `TableList.tsx` e contratto corrente | Participation/Partecipazione include partecipazione e gestione corrente; Available solo planning iscrivibili dei Group con membership accettata, senza partecipazione/gestione preesistente. Tables solo CONFIRMED/TERMINATED con giocatore nel roster confermato. Nessuna chip Available, due chip Tables. |
| Alta | Sezione 8, riga 697: ritorno ad Available dopo creazione standalone | Entrambi gli `EventWizard.tsx` usano `section=mine` | Correggere il rinvio a Participation. |
| Alta | Sezione 7, riga 659: collection indipendente da ownership/status | `bgg-collection.ts` richiede `own=1` nelle due richieste e `own="1"` nel parser | Documentare i soli giochi posseduti, distinguendo la nuova importazione da eventuali vecchi snapshot. |
| Media | Sezioni 2 e 7: Match/Organization presentati anche come domini operativi | Contratto unificato e route legacy ritirate | Usare Groups/Events/Tables per il dominio corrente; indicare il resto come compatibilita storica. |
| Media | Matrice skill: nomi presenti nel lock ma alcune guide assenti sul disco | Inventario e percorsi locali | Distinguere guida richiesta, registrata, installata e realmente disponibile; nessun reinstall automatico o espansione del task. |

Per il catalogo va allineato anche `docs/profiles.md`: le righe 27 e 35 conservano formulazioni precedenti,
mentre la sezione successiva descrive gia `own=1`. E un intervento coordinato di documentazione, non una modifica del prodotto.

## Togliere dal documento principale

- **Contratti storici imperativi:** sezione Matches, righe 569-647, e appendice Historical Groups and match-rating,
  da riga 1056. Spostarli integralmente in documentazione storica; conservare nel root il divieto di ripristinare
  writer/reader ritirati e il link al contratto attivo. Non cancellare la cronologia ne i vincoli di compatibilita.
- **Duplicazioni:** descrizioni complete di ruoli, cutoff, notifiche e risultati gia nel contratto di dominio.
  Tenere solo le invarianti trasversali e un riferimento preciso.
- **Ripetizioni di struttura e versioni:** evitare copie estese tra README, AGENTS e documenti architetturali.
  Manifest, lockfile e workflow restano la fonte verificabile per versioni e comandi.
- **Dettagli contingenti di singole regressioni:** trasformarli in istruzioni solo se prevengono un errore ancora possibile;
  spostare motivazioni e cronologia nel checkpoint. Non togliere alla cieca i workaround ancora necessari.

## Spostare vicino al codice o alla procedura

| Contenuto | Destinazione proposta | Da mantenere nel root |
| --- | --- | --- |
| Sezione 2: regole dettagliate di Group/Event/Table | `docs/groups-events-refactor.md` | Contratto attivo, autorita corrente, consenso, conferma esplicita e limiti del task |
| Sezione 6: notifiche e attenzione | Sezione Notification attention del contratto unificato | Lettura distinta da consenso, fonte autorizzata, rollback selettivo |
| Sezione 6: worker startup, cache, budget e retention | `docs/development.md`, con eventuale futura guida cache dedicata | Query/Zustand ownership, fresh token, isolamento proprietario e purge |
| Sezione 7: controller/CORS, mirror utenti, migrazioni, transazioni | Nuovo `apps/api/AGENTS.md` | Sicurezza e confini condivisi; indice verso le istruzioni API |
| Sezione 8: boundary Next.js e particolarita HeroUI web | Nuovo `apps/web/AGENTS.md` | Parita funzionale e ownership UI per piattaforma |
| Sezione 9: provider order, layout nativo, permessi, Skeleton e Babel | Nuovo `apps/mobile/AGENTS.md` | Stesse invarianti trasversali; link alla guida nativa |
| Sezioni 13-14: lane CI, APK reuse, cleanup, isolamento provider | `docs/organizations-events-operations.md` e workflow | Verifiche obbligatorie, nessuna mutazione provider implicita, gate verde diverso da E2E acceptance |
| Sezione 17: board automation e configurazione | Guida operativa dedicata | Opt-in esplicito prima di avviare il workflow engine |
| Matrice skill molto dettagliata | Guida sviluppo/skill dedicata | Gerarchia delle istruzioni, caricamento mirato e nessuna installazione implicita |

I file AGENTS locali dovrebbero contenere solo differenze reali per quella sottostruttura.
Niente copie del root e niente riorganizzazione del codice come effetto collaterale.

## Chiarire, senza indebolire

1. **Test ed E2E:** il requisito di copertura della sezione 12 e la disattivazione CI della sezione 13
   sono concetti distinti. Esplicitare cosa va mantenuto/scritto, cosa e stato eseguito e quali percorsi
   restano non accettati. I PR conservano le suite sotto policy `false`; main non ha piu i gate E2E.
2. **Git:** conservare commit firmati, Conventional Commits, divieto di push su main e PR solo su richiesta.
   Rendere esplicita la precedenza del branch indicato dall'operatore sul default di un nuovo branch da main.
3. **Comandi:** gli alias `pnpm --filter schemas` e `--filter shared` funzionano con pnpm attuale;
   i nomi completi scoped sono piu espliciti, ma non sono correzioni di comandi rotti.
   Distinguere `pnpm build` dai build nativi e non inventare un test script nel root.
4. **Skill:** gli esempi generici GitHub non sostituiscono Biome con ESLint, non introducono npm/yarn
   e non autorizzano nuovi servizi o provisioning.
5. **Link:** mantenere i riferimenti al README durante lo spostamento dei dettagli.
   Il nuovo README conserva `#client-responsiveness-defaults` e rimanda a retention e build nella guida sviluppo.

## Struttura suggerita dopo l'approvazione

1. Fonte di verita e mappa delle istruzioni locali.
2. Invarianti comuni: sicurezza, parita, i18n, stato, UI e scope.
3. Comandi verificati di setup, sviluppo e controlli mirati.
4. Confini di architettura e ownership condivisa.
5. Verifica e limiti delle evidenze.
6. Git e operazioni autorizzate.
7. Indice dei contratti di dominio e delle guide operative.

Prima correggere i riferimenti superati; poi trasferire i dettagli con link aggiornati;
infine eliminare le duplicazioni. Verificare che ogni vincolo critico abbia ancora una collocazione
raggiungibile e che le istruzioni locali non contraddicano quelle comuni.
