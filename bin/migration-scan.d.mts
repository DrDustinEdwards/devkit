export function contractions(sql: string): string[];
export function handOnly(sql: string): string[];
/** The statements of a migration with comments dropped and strings and quoted names blanked to `_`. */
export function statements(sql: string): string[];
