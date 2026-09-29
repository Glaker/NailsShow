#!/usr/bin/env node
//
// Guardas de herramientas para Claude Code (hook PreToolUse).
//
// Por qué existe
// --------------
// Las invariantes de CLAUDE.md §3 las hace cumplir la base (RLS, triggers,
// pgTAP), pero un agente puede escribir una migración o un archivo que las viole
// antes de que ninguna prueba corra. Este script corta esa escritura en el
// momento en que se intenta, y le devuelve al agente el motivo.
//
// Qué bloquea
// -----------
//  a) UPDATE / DELETE / TRUNCATE sobre core.auditoria y core.firmas, y los GRANT
//     o políticas que los habiliten. Invariantes 1 y 2.
//  b) Editar una migración que ya existe en supabase/migrations/. GAMP 5 exige
//     el historial completo: la corrección es una migración nueva. §6.
//  c) La cadena service_role (o SUPABASE_SERVICE) dentro de src/. Invariante 4.
//     Respeta la misma etiqueta de excepción que scripts/check-service-role.sh.
//  d) git con --no-verify (o commit -n), que saltea los hooks de pre-commit,
//     entre ellos gitleaks.
//
// Contrato: lee el JSON del hook por stdin. Sale con 0 para dejar pasar y con 2
// para bloquear; en ese caso el texto de stderr le llega al agente.
//
// Límite conocido: las guardas sobre comandos de shell son heurísticas. La
// autoridad sigue siendo la base de datos y el CI, no este script.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ETIQUETA_PERMISO = 'permitido-service-role';

const TABLAS_PROTEGIDAS = String.raw`"?core"?\s*\.\s*"?(?:auditoria|firmas)\w*"?`;
const DML_PROHIBIDO = [
  new RegExp(String.raw`\bUPDATE\s+(?:ONLY\s+)?${TABLAS_PROTEGIDAS}`, 'i'),
  new RegExp(String.raw`\bDELETE\s+FROM\s+(?:ONLY\s+)?${TABLAS_PROTEGIDAS}`, 'i'),
  new RegExp(String.raw`\bTRUNCATE\s+(?:TABLE\s+)?(?:ONLY\s+)?${TABLAS_PROTEGIDAS}`, 'i'),
  new RegExp(
    String.raw`\bGRANT\s+[^;]*\b(?:UPDATE|DELETE|TRUNCATE|ALL)\b[^;]*\bON\s+(?:TABLE\s+)?${TABLAS_PROTEGIDAS}`,
    'i',
  ),
  new RegExp(
    String.raw`\bGRANT\s+[^;]*\b(?:UPDATE|DELETE|TRUNCATE|ALL)\b[^;]*\bON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+[^;]*\bcore\b`,
    'i',
  ),
  new RegExp(
    String.raw`\bCREATE\s+POLICY\s+[^;]*?\bON\s+${TABLAS_PROTEGIDAS}\s+(?:AS\s+\w+\s+)?FOR\s+(?:UPDATE|DELETE|ALL)\b`,
    'i',
  ),
];

const SERVICE_ROLE = /service_role|SUPABASE_SERVICE/i;
const RUTA_MIGRACIONES = /supabase[\\/]+migrations[\\/]/i;

function bloquear(motivo) {
  process.stderr.write(`Bloqueado por .claude/hooks/guardas.mjs\n${motivo}\n`);
  process.exit(2);
}

function sinComentariosSql(texto) {
  return texto.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

function violaTablasProtegidas(texto) {
  const limpio = sinComentariosSql(texto);
  return DML_PROHIBIDO.some((re) => re.test(limpio));
}

// En Windows la ruta puede llegar como C:\... o, desde Git Bash, como /c/...
function normalizar(ruta) {
  if (process.platform === 'win32') {
    const msys = /^\/([a-zA-Z])\/(.*)$/.exec(ruta);
    if (msys) return `${msys[1]}:/${msys[2]}`;
  }
  return ruta;
}

function rutaRelativa(proyecto, archivo) {
  const rel = path.relative(
    path.resolve(normalizar(proyecto)),
    path.resolve(normalizar(proyecto), normalizar(archivo)),
  );
  return rel.split(path.sep).join('/');
}

function textoNuevo(herramienta, entrada) {
  if (herramienta === 'Write') return entrada.content ?? '';
  if (herramienta === 'Edit') return entrada.new_string ?? '';
  if (herramienta === 'MultiEdit')
    return (entrada.edits ?? []).map((e) => e.new_string ?? '').join('\n');
  return '';
}

function revisarArchivo(herramienta, entrada, proyecto) {
  const archivo = entrada.file_path;
  if (!archivo) return;
  const rel = rutaRelativa(proyecto, archivo);
  const texto = textoNuevo(herramienta, entrada);

  if (/^supabase\/migrations\//i.test(rel)) {
    // (b) Una migración existente ya forma parte del historial.
    if (existsSync(path.resolve(normalizar(proyecto), normalizar(archivo)))) {
      bloquear(
        `No se edita una migración existente (${rel}). El control de cambios de GAMP 5 ` +
          'exige el historial completo: escribí una migración nueva que corrija la anterior. ' +
          'Si esta migración todavía no se aplicó ni se commiteó, pedile al usuario que la edite él.',
      );
    }
    // (a) DML sobre registros append-only.
    if (violaTablasProtegidas(texto)) {
      bloquear(
        `La migración ${rel} modifica o borra filas de core.auditoria o core.firmas, o habilita ` +
          'hacerlo. Invariantes 1 y 2 de CLAUDE.md: son append-only para todo rol. ' +
          'La corrección se hace con un registro rectificativo que apunta al original.',
      );
    }
  }

  // (c) service_role en el árbol de fuentes del frontend.
  if (/^src\//i.test(rel)) {
    const linea = texto
      .split('\n')
      .find((l) => SERVICE_ROLE.test(l) && !l.includes(ETIQUETA_PERMISO));
    if (linea !== undefined) {
      bloquear(
        `Se intentó escribir una referencia a service_role en ${rel}:\n    ${linea.trim()}\n` +
          'Invariante 4 de CLAUDE.md: esa clave tiene BYPASSRLS y nunca llega al cliente. Ver §5. ' +
          `Si es solo una mención en un comentario, agregá la etiqueta '${ETIQUETA_PERMISO}' en la misma línea.`,
      );
    }
  }
}

function revisarComando(comando) {
  // (d) Saltear los hooks de git.
  if (
    /\bgit\b[^\n;&|]*\s--no-verify\b/.test(comando) ||
    /\bgit\s+commit\b[^\n;&|]*\s-[a-zA-Z]*n[a-zA-Z]*\b/.test(comando)
  ) {
    bloquear(
      'No se usa --no-verify (ni commit -n): saltea el pre-commit, incluido gitleaks. ' +
        'Si un hook falla, corregí la causa.',
    );
  }

  // (b) Modificar migraciones desde la shell.
  if (RUTA_MIGRACIONES.test(comando)) {
    const redireccionAMigracion =
      /(?:>>?|\btee\s+(?:-a\s+)?)\s*["']?[^\s"'|;&]*supabase[\\/]+migrations[\\/]/i;
    const operacionDeEscritura =
      /\bsed\s+(?:-[a-zA-Z]*\s+)*-i|\bperl\s+-[a-zA-Z]*i|\brm\b|\bmv\b|\bgit\s+(?:mv|rm)\b|\b(?:Set-Content|Add-Content|Clear-Content|Out-File|Remove-Item|Move-Item|Rename-Item)\b/i;
    if (redireccionAMigracion.test(comando) || operacionDeEscritura.test(comando)) {
      bloquear(
        'El comando parece modificar, mover o borrar archivos de supabase/migrations/. ' +
          'Las migraciones existentes no se tocan; la corrección es una migración nueva.',
      );
    }
  }

  // (a) DML directo contra las tablas append-only (psql, supabase db query, etc.).
  if (violaTablasProtegidas(comando)) {
    bloquear(
      'El comando modifica o borra filas de core.auditoria o core.firmas. Invariantes 1 y 2 de CLAUDE.md.',
    );
  }
}

let entrada;
try {
  entrada = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const herramienta = entrada.tool_name;
const datos = entrada.tool_input ?? {};
const proyecto = process.env.CLAUDE_PROJECT_DIR || entrada.cwd || process.cwd();

if (herramienta === 'Write' || herramienta === 'Edit' || herramienta === 'MultiEdit') {
  revisarArchivo(herramienta, datos, proyecto);
} else if (herramienta === 'Bash' || herramienta === 'PowerShell') {
  revisarComando(datos.command ?? '');
}

process.exit(0);
