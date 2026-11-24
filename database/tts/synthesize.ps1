# Synthesizes SSML jobs to WAV files using the offline Windows (OneCore) speech voices.
# Called by generate-audio.mjs:  powershell -NoProfile -File synthesize.ps1 -JobsFile jobs.json -OutDir <dir>
# jobs.json: [{ "id": "ft01-p3-s01", "ssml": "<speak ...>" }, ...]
param(
  [Parameter(Mandatory = $true)][string]$JobsFile,
  [Parameter(Mandatory = $true)][string]$OutDir
)
$ErrorActionPreference = 'Stop'

$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } |
  Select-Object -First 1
function Wait-Op($op, [Type]$resultType) {
  $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($op))
  $task.Wait() | Out-Null
  return $task.Result
}

$jobs = Get-Content -Raw -Encoding UTF8 $JobsFile | ConvertFrom-Json
$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$done = 0
foreach ($job in $jobs) {
  $stream = Wait-Op ($synth.SynthesizeSsmlToStreamAsync($job.ssml)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
  $size = [uint32]$stream.Size
  $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
  $null = Wait-Op ($reader.LoadAsync($size)) ([uint32])
  $bytes = New-Object byte[] $size
  $reader.ReadBytes($bytes)
  [IO.File]::WriteAllBytes((Join-Path $OutDir "$($job.id).wav"), $bytes)
  $reader.Dispose(); $stream.Dispose()
  $done++
  Write-Output "synthesized $($job.id) ($done/$($jobs.Count))"
}
