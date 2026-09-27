const { readFileSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ENV_VARIABLE_NAME = 'sportsgameodds';

function defaultEnvFilePath() {
  return path.join(os.homedir(), 'Sites', '.env');
}

function parseEnvValue(line) {
  const trimmed = line.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadSportsGameOddsKey(envFilePath = defaultEnvFilePath()) {
  let envFile;
  try {
    envFile = readFileSync(envFilePath, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read ${ENV_VARIABLE_NAME} from ${envFilePath}`);
  }

  for (const line of envFile.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    if (key !== ENV_VARIABLE_NAME) {
      continue;
    }

    const value = parseEnvValue(trimmed.slice(separatorIndex + 1));
    if (!value) {
      break;
    }

    return value;
  }

  throw new Error(`Missing required ${ENV_VARIABLE_NAME} value`);
}

module.exports = { loadSportsGameOddsKey };
