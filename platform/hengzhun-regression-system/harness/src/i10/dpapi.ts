import { spawnSync } from 'node:child_process';

const POWERSHELL_PROTECT = String.raw`
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$raw=[Console]::In.ReadToEnd()
$request=$raw | ConvertFrom-Json
$bytes=[Convert]::FromBase64String([string]$request.payload)
$entropy=[Text.Encoding]::UTF8.GetBytes('hengzhun-i10-credential-v1')
$cipher=[Security.Cryptography.ProtectedData]::Protect($bytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
[Console]::Out.Write([Convert]::ToBase64String($cipher))
`;

const POWERSHELL_UNPROTECT = String.raw`
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$raw=[Console]::In.ReadToEnd()
$request=$raw | ConvertFrom-Json
$cipher=[Convert]::FromBase64String([string]$request.payload)
$entropy=[Text.Encoding]::UTF8.GetBytes('hengzhun-i10-credential-v1')
$bytes=[Security.Cryptography.ProtectedData]::Unprotect($cipher,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
[Console]::Out.Write([Convert]::ToBase64String($bytes))
`;

function runDpapi(script: string, payload: Buffer): Buffer {
  if (process.platform !== 'win32') throw new Error('I10_DPAPI_WINDOWS_REQUIRED');
  const encodedScript = Buffer.from(script, 'utf16le').toString('base64');
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodedScript], {
    input: JSON.stringify({ payload: payload.toString('base64') }),
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024
  });
  if (result.status !== 0 || !result.stdout?.trim()) throw new Error('I10_DPAPI_OPERATION_FAILED');
  try {
    return Buffer.from(result.stdout.trim(), 'base64');
  } catch {
    throw new Error('I10_DPAPI_OUTPUT_INVALID');
  }
}

export function protectWithCurrentUserDpapi(plaintext: Buffer): Buffer {
  return runDpapi(POWERSHELL_PROTECT, plaintext);
}

export function unprotectWithCurrentUserDpapi(ciphertext: Buffer): Buffer {
  return runDpapi(POWERSHELL_UNPROTECT, ciphertext);
}
