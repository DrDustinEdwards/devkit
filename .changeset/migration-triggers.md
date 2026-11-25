---
"@dustinedwards/devkit": patch
---

`devkit-migrations` reads a trigger's body only when a write in the same file can fire it: an INSERT into the table the trigger is on, or any other write. A file that creates triggers and only backfills another table (Foxing's `0021_book_subjects.sql`, whose `DELETE FROM book_subjects` sits in an `AFTER UPDATE ON books` trigger) is no longer read as deleting rows.
