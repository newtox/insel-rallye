import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const store = openDb(path.resolve(ROOT, process.env.DATA_DIR || 'data'));
const [cmd, ...args] = process.argv.slice(2);

const help = `Insel Rallye – Verwaltung

  node server/admin.js invite [anzahl-nutzungen]   Einladungscode erzeugen (Standard: 1 Nutzung)
  node server/admin.js invites                      Alle Einladungscodes anzeigen
  node server/admin.js uninvite <CODE>              Einladungscode löschen
  node server/admin.js users                        Alle Accounts anzeigen
  node server/admin.js deluser <name>               Account löschen
  node server/admin.js passwd <name> <passwort>     Passwort neu setzen
`;

switch (cmd) {
  case 'invite': {
    const uses = Math.max(1, parseInt(args[0] || '1', 10) || 1);
    console.log(store.createInvite(uses));
    break;
  }
  case 'invites':
    for (const i of store.listInvites()) console.log(`${i.code}  noch ${i.uses_left}x  (${new Date(i.created).toLocaleString('de-DE')})`);
    break;
  case 'uninvite':
    store.deleteInvite(String(args[0] || '').toUpperCase());
    console.log('gelöscht');
    break;
  case 'users':
    for (const u of store.listUsers()) console.log(`${u.id}\t${u.username}\t${u.character}\t${new Date(u.created).toLocaleString('de-DE')}`);
    break;
  case 'deluser': {
    const u = store.userByName(args[0] || '');
    if (!u) {
      console.error('Account nicht gefunden');
      process.exit(1);
    }
    store.deleteUser(u.id);
    console.log('gelöscht');
    break;
  }
  case 'passwd': {
    const u = store.userByName(args[0] || '');
    if (!u || !args[1] || args[1].length < 6) {
      console.error('Account nicht gefunden oder Passwort zu kurz (min. 6)');
      process.exit(1);
    }
    await store.setPassword(u.id, args[1]);
    console.log('Passwort gesetzt');
    break;
  }
  default:
    console.log(help);
}
