param(
    [string]$ResourceGroup  = "zusu-dc-rg",
    [string]$StorageAccount = ("zusuimages" + (Get-Random -Maximum 9999)),
    [string]$Location       = "southafricanorth",
    [string]$Container      = "zusu-images",
    [string]$ImagesRoot     = "E:\ZUSA"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== ZUSU Azure Setup ===" -ForegroundColor Cyan

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    Write-Error "Azure CLI not found. Install from https://aka.ms/installazurecliwindows"
    exit 1
}

$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) {
    Write-Host "Not logged in. Running az login..." -ForegroundColor Yellow
    az login
    $account = az account show | ConvertFrom-Json
}
Write-Host ("Logged in as: " + $account.user.name) -ForegroundColor Green

Write-Host ""
Write-Host "[1/5] Creating resource group..." -ForegroundColor Yellow
az group create --name $ResourceGroup --location $Location --output none

Write-Host "[2/5] Creating storage account $StorageAccount ..." -ForegroundColor Yellow
az storage account create `
    --name $StorageAccount `
    --resource-group $ResourceGroup `
    --location $Location `
    --sku Standard_LRS `
    --allow-blob-public-access true `
    --output none

Write-Host "[3/5] Creating container with public read access..." -ForegroundColor Yellow
az storage container create `
    --name $Container `
    --account-name $StorageAccount `
    --public-access blob `
    --output none

Write-Host "[4/5] Uploading images..." -ForegroundColor Yellow

$albumMap = @{
    "26th pics" = "26th-pics"
    "27th"      = "27th"
    "Last day"  = "last-day"
}

$totalUploaded = 0
foreach ($localFolder in $albumMap.Keys) {
    $blobFolder = $albumMap[$localFolder]
    $sourcePath = Join-Path $ImagesRoot $localFolder
    if (-not (Test-Path $sourcePath)) {
        Write-Warning ("Folder not found: " + $sourcePath + " - skipping")
        continue
    }
    $files = Get-ChildItem $sourcePath -Filter "*.JPG"
    Write-Host ("  " + $files.Count + " files from " + $localFolder + " -> " + $blobFolder) -ForegroundColor Gray

    az storage blob upload-batch `
        --account-name $StorageAccount `
        --destination ($Container + "/" + $blobFolder) `
        --source $sourcePath `
        --pattern "*.JPG" `
        --overwrite true `
        --output none

    $totalUploaded += $files.Count
}

Write-Host ("  Total uploaded: " + $totalUploaded + " images") -ForegroundColor Green

Write-Host "[5/5] Updating manifest.json..." -ForegroundColor Yellow

$baseUrl = "https://" + $StorageAccount + ".blob.core.windows.net/" + $Container

$manifestPath = Join-Path $PSScriptRoot "data\manifest.json"
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$manifest.baseUrl = $baseUrl
$manifest | ConvertTo-Json -Depth 10 | Set-Content $manifestPath -Encoding UTF8

Write-Host ""
Write-Host "Done!" -ForegroundColor Green
Write-Host "==========================================================="
Write-Host ("Base URL: " + $baseUrl) -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Create a Static Web App in portal.azure.com (Free tier)"
Write-Host "  2. Link it to GitHub repo: ezrankhata/ZUSU-DC, branch master"
Write-Host "  3. Then run these commands:"
Write-Host "       git add data/manifest.json"
Write-Host "       git commit -m update-storage-url"
Write-Host "       git push"
Write-Host "==========================================================="
