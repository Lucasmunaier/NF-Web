# Security Specification PAMA-LS

## 1. Data Invariants
- A note cannot be created without a timestamp and a status.
- Only the creator or the current responsible can update a note's status.
- Users cannot change their own roles.
- Notes in 'DESPACHADA' (terminal state) cannot be edited except by admins.

## 2. The Dirty Dozen Payloads
1. **Self-Promotion:** User attempts to update their own `role` to `ADMIN`.
2. **Identity Spoofing:** User attempts to create a note with someone else's `uid` as the creator.
3. **Invalid ID Poisoning:** Document ID with 2KB junk string.
4. **Massive Array:** Injecting 10,000 comments into `historico_comentarios`.
5. **PII Leak:** Random user trying to list the entire `usuarios` collection.
6. **Terminal Edit:** Trying to change the value of a `DESPACHADA` note.
7. **Negative Value:** Setting invoice `value` to -100.
8. **Shadow Field:** Adding `is_secret: true` to an invoice document.
9. **Bypassing Workflow:** Moving a note from `PENDENTE` to `DESPACHADA` directly (if logic forbids it).
10. **Timestamp Spoofing:** Sending a `data_criacao` from the future.
11. **CNPJ Poisoning:** 1MB string in `cnpj` field.
12. **Orphaned Writes:** Creating a note with a `responsavel_atual_uid` that doesn't exist in `usuarios`.

## 3. Test Runner
A `firestore.rules.test.ts` would be used to verify these. (I will focus on the rules first).
