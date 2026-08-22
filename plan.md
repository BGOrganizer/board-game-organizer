# Release 2 — Roadmap (Plan)

> Deferred from Release 1 (Social/Contacts core) by user decision. Everything
> here is explicitly OUT of the current PR #16 scope.

## Friend requests (richieste di amicizia)

- Invio/accettazione/rifiuto di richieste di amicizia esplicite
- Stato `pending/sent` già modellato in `packages/schemas` (friendRequests) e
  nel backend (`LISTS.pending/sent`) — manca la UI web+mobile
- UI prevista: tab/lista "Richieste" con bottone accetta/rifiuta

## Cleanup inviti scaduti

- Job periodico per scadere gli inviti pending oltre il TTL
- `InvitesRepository.expireStale()` già implementato (apps/api) — manca il
  trigger (cron, e.g. GitHub Actions schedule o Vercel cron)

## Nota

- La gestione **blocchi** NON è qui: viene implementata nella release corrente
  (PR #16) come da feedback utente (click sull'utente → menu blocco/sblocco,
  segui/non seguire, visualizza profilo [non implementato])
