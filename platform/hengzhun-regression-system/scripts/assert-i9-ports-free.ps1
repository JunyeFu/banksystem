[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ports = 3006, 18788, 18789
foreach ($port in $ports) {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
    try { $listener.Start() } catch { throw "I9 formal TCP port is already occupied: 127.0.0.1:$port" } finally { $listener.Stop() }
}

Write-Output 'HENGZHUN_I9_PORTS_FREE'
