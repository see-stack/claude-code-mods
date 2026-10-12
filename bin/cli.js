#!/usr/bin/env node

/**
 * See Stack CLI for Claude Code Mods
 * https://seestack.dev
 */

const { execSync, spawnSync } = require('child_process');
const readline = require('readline');

// ANSI formatting
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
};

const BANNER = `
${c.cyan}${c.bold}  ███████╗███████╗███████╗███████╗████████╗ █████╗  ██████╗██╗  ██╗
  ██╔════╝██╔════╝██╔════╝██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║ ██╔╝
  ███████╗█████╗  █████╗  ███████╗   ██║   ███████║██║     █████╔╝ 
  ╚════██║██╔══╝  ██╔══╝  ╚════██║   ██║   ██╔══██║██║     ██╔═██╗ 
  ███████║███████╗███████╗███████║   ██║   ██║  ██║╚██████╗██║  ██╗
  ╚══════╝╚══════╝╚══════╝╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝${c.reset}
  ${c.dim}Official Claude Code Mods & Telemetry • https://seestack.dev${c.reset}
`;

function checkClaudeInstalled() {
  try {
    const res = spawnSync('which', ['claude'], { encoding: 'utf8' });
    if (res.status === 0 && res.stdout.trim()) {
      return true;
    }
  } catch (e) {}
  return false;
}

function run(cmd, desc) {
  if (desc) {
    process.stdout.write(`  ${c.cyan}▸${c.reset} ${desc}... `);
  }
  try {
    execSync(cmd, { stdio: 'pipe' });
    if (desc) console.log(`${c.green}✔ done${c.reset}`);
    return true;
  } catch (err) {
    if (desc) console.log(`${c.red}✖ failed${c.reset}`);
    return false;
  }
}

function ensureMarketplace() {
  console.log(`\n${c.bold}1. Connecting to See Stack Marketplace:${c.reset}`);
  run('claude plugin marketplace add see-stack/claude-code-mods', 'Adding see-stack/claude-code-mods marketplace');
}

function installMods(mods = ['context-bar', 'read-aloud']) {
  ensureMarketplace();
  console.log(`\n${c.bold}2. Installing Mods:${c.reset}`);
  for (const mod of mods) {
    if (mod === 'context-bar') {
      run('claude plugin install context-bar@seestack-mods', 'Installing context-bar (Live Context Telemetry)');
    } else if (mod === 'read-aloud') {
      run('claude plugin install read-aloud@seestack-mods', 'Installing read-aloud (Voice Narration Player)');
    }
  }
  console.log(`\n${c.green}${c.bold}✨ All mods installed successfully!${c.reset}`);
  console.log(`\n${c.dim}Start Claude Code to see your new mods in action:${c.reset}`);
  console.log(`  ${c.bold}${c.cyan}claude${c.reset}\n`);
}

function updateMods() {
  ensureMarketplace();
  console.log(`\n${c.bold}Updating See Stack Mods:${c.reset}`);
  run('claude plugin update context-bar@seestack-mods', 'Updating context-bar');
  run('claude plugin update read-aloud@seestack-mods', 'Updating read-aloud');
  console.log(`\n${c.green}${c.bold}✔ Updates complete!${c.reset}\n`);
}

function listMods() {
  console.log(`\n${c.bold}Installed Claude Code Plugins:${c.reset}\n`);
  try {
    execSync('claude plugin list', { stdio: 'inherit' });
  } catch (e) {
    console.log(`${c.red}Could not retrieve plugin list.${c.reset}`);
  }
}

function doctor() {
  console.log(`\n${c.bold}See Stack Environment Doctor:${c.reset}\n`);
  console.log(`  Node.js:  ${process.version}`);
  const hasClaude = checkClaudeInstalled();
  console.log(`  Claude:   ${hasClaude ? c.green + 'Installed' + c.reset : c.red + 'Not found' + c.reset}`);
  if (hasClaude) {
    try {
      const v = execSync('claude --version', { encoding: 'utf8' }).trim();
      console.log(`  Version:  ${v}`);
    } catch (e) {}
  }
  console.log('');
}

async function main() {
  console.log(BANNER);

  if (!checkClaudeInstalled()) {
    console.log(`${c.red}${c.bold}Error: Claude Code CLI not found.${c.reset}`);
    console.log(`\nPlease install Claude Code first:`);
    console.log(`  ${c.cyan}npm install -g @anthropic-ai/claude-code${c.reset}\n`);
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const command = args[0] ? args[0].toLowerCase() : null;

  if (command === 'update') {
    updateMods();
  } else if (command === 'list') {
    listMods();
  } else if (command === 'doctor') {
    doctor();
  } else if (command === 'help' || command === '--help' || command === '-h') {
    console.log(`Usage:`);
    console.log(`  npx seestack              ${c.dim}Interactive installation${c.reset}`);
    console.log(`  npx seestack install      ${c.dim}Install all mods${c.reset}`);
    console.log(`  npx seestack update       ${c.dim}Update all mods to latest${c.reset}`);
    console.log(`  npx seestack list         ${c.dim}List installed plugins${c.reset}`);
    console.log(`  npx seestack doctor       ${c.dim}Check environment status${c.reset}\n`);
  } else {
    // Default interactive / fast install
    installMods(['context-bar', 'read-aloud']);
  }
}

main();
