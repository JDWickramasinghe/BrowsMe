'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const BACKUP_SUFFIX = '.bak';

function getBackupPath(filePath) {
  return `${filePath}${BACKUP_SUFFIX}`;
}

function temporaryPathFor(filePath, label = 'tmp') {
  return path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.${label}`
  );
}

function fsyncDirectory(directory) {
  let descriptor;
  try {
    descriptor = fs.openSync(directory, 'r');
    fs.fsyncSync(descriptor);
  } catch {

  } finally {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {

      }
    }
  }
}

function writeDurableTemporaryFile(filePath, data, mode) {
  const temporaryPath = temporaryPathFor(filePath);
  let descriptor;
  try {
    descriptor = fs.openSync(temporaryPath, 'wx', mode);
    fs.writeFileSync(descriptor, data);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    return temporaryPath;
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {

      }
    }
    try {
      fs.unlinkSync(temporaryPath);
    } catch {

    }
    throw error;
  }
}

function replaceFileAtomically(temporaryPath, destinationPath) {
  try {
    fs.renameSync(temporaryPath, destinationPath);
    return;
  } catch (replaceError) {
    if (!fs.existsSync(destinationPath)) {
      throw replaceError;
    }

    const displacedPath = temporaryPathFor(destinationPath, 'previous');
    try {
      fs.renameSync(destinationPath, displacedPath);
    } catch {
      throw replaceError;
    }

    try {
      fs.renameSync(temporaryPath, destinationPath);
    } catch (commitError) {
      try {
        if (!fs.existsSync(destinationPath) && fs.existsSync(displacedPath)) {
          fs.renameSync(displacedPath, destinationPath);
        }
      } catch {

      }
      throw commitError;
    }

    try {
      fs.unlinkSync(displacedPath);
    } catch {

    }
  }
}

function validBytes(filePath, validateExisting) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const bytes = fs.readFileSync(filePath);
    if (validateExisting) {
      validateExisting(bytes);
    }
    return bytes;
  } catch {
    return null;
  }
}

function atomicWriteFileSync(filePath, data, options = {}) {
  const mode = options.mode ?? 0o600;
  const backupEnabled = options.backup !== false;
  const backupPath = getBackupPath(filePath);
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });

  let temporaryPath = writeDurableTemporaryFile(filePath, data, mode);
  try {
    if (backupEnabled) {
      let backupBytes = validBytes(filePath, options.validateExisting);

      if (!backupBytes && options.transformBackup) {
        backupBytes = validBytes(backupPath, options.validateExisting);
      }
      if (backupBytes) {
        const durableBackup = options.transformBackup
          ? options.transformBackup(backupBytes)
          : backupBytes;
        const backupTemporaryPath = writeDurableTemporaryFile(backupPath, durableBackup, mode);
        try {
          replaceFileAtomically(backupTemporaryPath, backupPath);
        } finally {
          try {
            fs.unlinkSync(backupTemporaryPath);
          } catch {

          }
        }
      }
    }

    replaceFileAtomically(temporaryPath, filePath);
    temporaryPath = null;
    fsyncDirectory(directory);
  } finally {
    if (temporaryPath) {
      try {
        fs.unlinkSync(temporaryPath);
      } catch {

      }
    }
  }
}

function readRecoverableFileSync(filePath, decode, options = {}) {
  let primaryError;
  try {
    return decode(fs.readFileSync(filePath));
  } catch (error) {
    primaryError = error;
  }

  const backupPath = getBackupPath(filePath);
  try {
    const backupBytes = fs.readFileSync(backupPath);
    const value = decode(backupBytes);
    const shouldRepairPrimary = typeof options.repairPrimary === 'function'
      ? options.repairPrimary(backupBytes, value)
      : options.repairPrimary !== false;
    if (shouldRepairPrimary) {
      try {
        atomicWriteFileSync(filePath, backupBytes, {
          mode: options.mode ?? 0o600,
          backup: false
        });
      } catch {

      }
    }
    return value;
  } catch (backupError) {
    const error = new Error(`Could not read ${path.basename(filePath)} or its backup.`);
    error.cause = { primaryError, backupError };
    throw error;
  }
}

module.exports = {
  atomicWriteFileSync,
  getBackupPath,
  readRecoverableFileSync
};
