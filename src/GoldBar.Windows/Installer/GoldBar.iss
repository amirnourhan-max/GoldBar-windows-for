#define MyAppName "Gold Bar"
#define MyAppVersion "2.0.0"
#define MyAppPublisher "Amirnourhan"
#define MyAppExeName "GoldBar.exe"

[Setup]
AppId={{8B1D4761-D5EF-4F51-9FE8-4A079A9E4A92}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\GoldBar
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=Output
OutputBaseFilename=GoldBar-Setup-v2.0.0-r12
SetupIconFile=..\Renderer\assets\GoldBar.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
RestartApplications=no
MinVersion=10.0.17763

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\publish\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "MicrosoftEdgeWebview2Setup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall skipifsourcedoesntexist

[Icons]
Name: "{autoprograms}\Gold Bar"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\Gold Bar"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked
Name: "webview2"; Description: "Install/repair Microsoft Edge WebView2 Runtime"; GroupDescription: "Runtime:"; Flags: checkedonce

[InstallDelete]
; A fresh installer run always starts the login identity from registration. This also
; handles upgrades from older builds whose uninstallers did not remove credentials.
Type: files; Name: "{localappdata}\GoldBar\credentials.json"
Type: files; Name: "{localappdata}\GoldBar\credentials.json.tmp"

[UninstallDelete]
; A normal uninstall also removes only the login credential. Scale/report settings are kept.
Type: files; Name: "{localappdata}\GoldBar\credentials.json"
Type: files; Name: "{localappdata}\GoldBar\credentials.json.tmp"

[Run]
Filename: "{tmp}\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; StatusMsg: "Installing WebView2 Runtime..."; Flags: waituntilterminated skipifsilent; Tasks: webview2; Check: FileExists(ExpandConstant('{tmp}\MicrosoftEdgeWebview2Setup.exe'))
Filename: "{app}\{#MyAppExeName}"; Description: "Launch Gold Bar"; Flags: nowait postinstall skipifsilent
