# ─────────────────────────────────────────────────────────────────
#  ZUSU Image Download Centre – Azure Setup Script
#  Run once: creates Blob Storage, uploads images, updates manifest
# ─────────────────────────────────────────────────────────────────
#  Prerequisites: Azure CLI installed + logged in (az login)
# ─────────────────────────────────────────────────────────────────

param(
    [string]$ResourceGroup   = "zusu-dc-rg",
    [string]$StorageAccount  = "zusuimages$(Get-Random -Maximum 9999)",  # must be globally unique
    [string]$Location        = "southafricanorth",   # closest free-tier region to Zambia
    [string]$Container       = "zusu-images",
    [string]$ImagesRoot      = "E:\ZUSA"
)

$ErrorActionPreference = "Stop"

Write-Host "`n=== ZUSU Azure Setup ===" -ForegroundColor Cyan

# ── 1. Check az CLI ────────────────────────────────────────────────
if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    Write-Error "Azure CLI not found. Install from https://aka.ms/installazurecliwindows"
    exit 1
}

# Check logged in
$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) {
    Write-Host "Not logged in. Running az login..." -ForegroundColor Yellow
    az login
}
Write-Host "Logged in as: $($account.user.name)" -ForegroundColor Green

# ── 2. Create resource group ───────────────────────────────────────
Write-Host "`n[1/5] Creating resource group '$ResourceGroup'..." -ForegroundColor Yellow
az group create --name $ResourceGroup --location $Location --output none

# ── 3. Create storage account ─────────────────────────────────────
Write-Host "[2/5] Creating storage account '$StorageAccount'..." -ForegroundColor Yellow
az storage account create `
    --name $StorageAccount `
    --resource-group $ResourceGroup `
    --location $Location `
    --sku Standard_LRS `
    --allow-blob-public-access true `
    --output none

# ── 4. Create blob container with public read access ───────────────
Write-Host "[3/5] Creating container '$Container' with public read access..." -ForegroundColor Yellow
az storage container create `
    --name $Container `
    --account-name $StorageAccount `
    --public-access blob `
    --output none

# ── 5. Upload images ───────────────────────────────────────────────
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
        Write-Warning "Folder not found: $sourcePath — skipping"
        continue
    }
    $files = Get-ChildItem $sourcePath -Filter "*.JPG"
    Write-Host "  Uploading $($files.Count) files from '$localFolder' → '$blobFolder/'..." -ForegroundColor Gray

    az storage blob upload-batch `
        --account-name $StorageAccount `
        --destination "$Container/$blobFolder" `
        --source $sourcePath `
        --pattern "*.JPG" `
        --overwrite true `
        --output none

    $totalUploaded += $files.Count
}

Write-Host "  Total uploaded: $totalUploaded images" -ForegroundColor Green

# ── 6. Get base URL and update manifest ───────────────────────────
Write-Host "[5/5] Updating manifest.json..." -ForegroundColor Yellow

$baseUrl = "https://$StorageAccount.blob.core.windows.net/$Container"

$manifestPath = Join-Path $PSScriptRoot "data\manifest.json"
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$manifest.baseUrl = $baseUrl
$manifest | ConvertTo-Json -Depth 10 | Set-Content $manifestPath -Encoding UTF8

Write-Host "`n✅ Done!" -ForegroundColor Green
Write-Host "─────────────────────────────────────────────────────────────"
Write-Host "Base URL: $baseUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Go to portal.azure.com → Create 'Static Web App' (Free tier)"
Write-Host "  2. Link it to: https://github.com/ezrankhata/ZUSU-DC"
Write-Host "  3. Azure will add the deploy token to your GitHub repo automatically"
Write-Host "  4. Commit and push this repo — GitHub Actions will deploy the site"
Write-Host ""
Write-Host "  git add data/manifest.json"
Write-Host "  git commit -m 'Configure Azure Blob Storage URL'"
Write-Host "  git push"
Write-Host "─────────────────────────────────────────────────────────────`n"
