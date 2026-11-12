$ErrorActionPreference = 'Stop'

function Test-TcpPort([string]$HostName, [int]$Port) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $task = $client.ConnectAsync($HostName, $Port)
        if (-not $task.Wait(1500)) { return $false }
        return $client.Connected
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

if (-not (Get-Command mvn -ErrorAction SilentlyContinue)) {
    throw 'Maven was not found. Install Maven and Java 17, then open a new terminal.'
}
$useLocalH2 = -not (Test-TcpPort 'localhost' 3306)

$secureDbPassword = $null
$secureAdminPassword = $null
$dbPtr = [IntPtr]::Zero
$adminPtr = [IntPtr]::Zero
$dbPasswordValue = $null
$adminPasswordValue = $null
$runCode = 0
$environmentNames = @('DB_HOST','DB_PORT','DB_NAME','DB_USERNAME','DB_PASSWORD','JWT_SECRET','AUTH_COOKIE_SECURE','CORS_ORIGINS','INITIAL_ADMIN_USERNAME','INITIAL_ADMIN_EMAIL','INITIAL_ADMIN_PASSWORD','SPRING_PROFILES_ACTIVE')
$previousEnvironment = @{}
foreach ($name in $environmentNames) { $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }

Push-Location $PSScriptRoot
try {
    if ($useLocalH2) {
        $env:SPRING_PROFILES_ACTIVE = 'local'
        New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot 'data') | Out-Null
        Write-Host 'MySQL is not listening on port 3306. Using the persistent H2 local-development database in backend/data.' -ForegroundColor Yellow
        Write-Host 'This is a real Spring Boot authentication flow for local development; the default/production configuration remains MySQL.' -ForegroundColor Yellow
    } else {
        Remove-Item Env:SPRING_PROFILES_ACTIVE -ErrorAction SilentlyContinue
        $env:DB_HOST = 'localhost'
        $env:DB_PORT = '3306'
        $env:DB_NAME = 'wildlife'
        # Check the MySQL login before starting Spring Boot so a wrong password is reported in one line and can be
        # retyped. The password reaches the check only through the environment and is never printed.
        $connectorJar = Get-ChildItem (Join-Path $env:USERPROFILE '.m2\repository\com\mysql\mysql-connector-j') -Recurse -Filter 'mysql-connector-j-*.jar' -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -notmatch 'sources|javadoc' } | Sort-Object FullName -Descending | Select-Object -First 1
        for ($attempt = 1; $attempt -le 3; $attempt++) {
            $env:DB_USERNAME = Read-Host 'MySQL username (usually root)'
            if ([string]::IsNullOrWhiteSpace($env:DB_USERNAME)) { $env:DB_USERNAME = 'root' }
            $secureDbPassword = Read-Host 'MySQL password' -AsSecureString
            $dbPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureDbPassword)
            $dbPasswordValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($dbPtr)
            $env:DB_PASSWORD = $dbPasswordValue
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($dbPtr)
            $dbPtr = [IntPtr]::Zero
            if (-not $connectorJar) { Write-Host 'MySQL connector not found in the Maven cache; skipping the login check.' -ForegroundColor Yellow; break }
            & java -cp $connectorJar.FullName (Join-Path $PSScriptRoot 'tools\MySqlLoginCheck.java')
            if ($LASTEXITCODE -eq 0) { Write-Host "MySQL login OK for user '$($env:DB_USERNAME)'." -ForegroundColor Green; break }
            if ($LASTEXITCODE -ne 2) { throw 'Could not connect to MySQL on localhost:3306 (see the message above).' }
            if ($attempt -eq 3) { throw 'MySQL rejected the username/password three times. Confirm the MySQL password (for example with MySQL Workbench or MySQL Shell), then run this script again.' }
            Write-Host 'MySQL rejected that username/password. Please try again.' -ForegroundColor Yellow
        }
    }

    $jwtBytes = New-Object byte[] 32
    $randomGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $randomGenerator.GetBytes($jwtBytes) } finally { $randomGenerator.Dispose() }
    $env:JWT_SECRET = [Convert]::ToBase64String($jwtBytes)
    [Array]::Clear($jwtBytes, 0, $jwtBytes.Length)
    $env:AUTH_COOKIE_SECURE = 'false'
    $env:CORS_ORIGINS = 'http://localhost:5173'

    # Admin setup is only needed the first time. Press Enter at the username prompt to skip it once an admin exists.
    $adminUsername = Read-Host 'First admin username (example: zovive-admin; press Enter to skip if an admin already exists)'
    $setUpAdmin = -not [string]::IsNullOrWhiteSpace($adminUsername)
    if (-not $setUpAdmin) {
        Remove-Item Env:INITIAL_ADMIN_USERNAME, Env:INITIAL_ADMIN_EMAIL, Env:INITIAL_ADMIN_PASSWORD -ErrorAction SilentlyContinue
        Write-Host 'Skipping admin setup; existing accounts are kept.' -ForegroundColor Green
    } else {
        $env:INITIAL_ADMIN_USERNAME = $adminUsername.Trim()
        $env:INITIAL_ADMIN_EMAIL = Read-Host 'First admin email'
        if ($env:INITIAL_ADMIN_USERNAME -notmatch '^[A-Za-z0-9._-]{3,64}$') {
            throw 'Username must be 3-64 characters using letters, numbers, dots, underscores, or hyphens.'
        }
        if ($env:INITIAL_ADMIN_EMAIL -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') {
            throw 'Enter a valid administrator email address.'
        }
        $secureAdminPassword = Read-Host 'First admin password (16-72 characters)' -AsSecureString
        $adminPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureAdminPassword)
        $adminPasswordValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($adminPtr)
        if ($adminPasswordValue.Length -lt 16 -or [Text.Encoding]::UTF8.GetByteCount($adminPasswordValue) -gt 72) {
            throw 'The first admin password must be at least 16 characters and no more than 72 UTF-8 bytes.'
        }
        $env:INITIAL_ADMIN_PASSWORD = $adminPasswordValue
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($adminPtr)
        $adminPtr = [IntPtr]::Zero
    }

    Write-Host 'Starting ZOVIVE API on http://localhost:8080.' -ForegroundColor Green
    if ($setUpAdmin) { Write-Host 'If no administrator exists yet, bootstrap will create the admin username entered above.' -ForegroundColor Green }
    & mvn spring-boot:run
    $runCode = $LASTEXITCODE
} finally {
    if ($dbPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($dbPtr) }
    if ($adminPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($adminPtr) }
    $secureDbPassword = $null
    $secureAdminPassword = $null
    $dbPasswordValue = $null
    $adminPasswordValue = $null
    foreach ($name in $environmentNames) {
        $oldValue = $previousEnvironment[$name]
        if ($null -eq $oldValue) { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
        else { [Environment]::SetEnvironmentVariable($name, $oldValue, 'Process') }
    }
    $oldValue = $null
    $previousEnvironment.Clear()
    Pop-Location
}

if ($runCode -ne 0) { throw "Spring Boot stopped with exit code $runCode. Check the first ERROR in the API log." }
