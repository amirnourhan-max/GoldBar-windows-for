# GOLD BAR for Windows

نرم‌افزار مدیریت آبشده و محاسبات عیار طلا برای ویندوز — ساخته‌شده با WPF (.NET 10) و رابط کاربری WebView2.

Gold melting & gold-assay management desktop app for Windows, built with WPF (.NET 10) and a WebView2-powered UI.

> پورت دقیق منطق محاسباتی از فایل مرجع `Golde Bar1-1.xlsx` — با خودآزمایی خودکار در هر بیلد.

## ✨ امکانات

- **ثبت سریع آبشده** — ثبت وزن (از ترازو یا دستی) و عیار با اعتبارسنجی ارقام فارسی/عربی
- **محاسبات عیار** — شمش عیار بالا، آلیاژ و نقره موردنیاز، تقسیم ۳۶.۷۹٪/۶۳.۲۱٪، اصلاح افت عیار
- **اتصال به ترازوی سریالی** — پشتیبانی از فریم‌های CR/LF و STX/ETX، خواندن خودکار و دستی
- **مظنه لحظه‌ای طلا** — دریافت «خرید از ما / فروش به ما» از سایت منبع مظنه (AminiGold)
- **گزارش Excel** — خروجی XLSX استاندارد و بازخوانی گزارش‌های قبلی
- **حساب کاربری امن** — ثبت‌نام اولیه، ورود و تغییر رمز (PBKDF2-SHA256، ذخیره‌سازی DPAPI)

## 🏗️ ساختار پروژه

```
src/GoldBar.Windows/
├── GoldBar.Windows.csproj     پروژه WPF (net10.0-windows، x64)
├── App.xaml(.cs)              نقطه ورود + حالت‌های --self-test و --ui-self-test
├── MainWindow.xaml(.cs)       میزبان WebView2 و پل ارتباطی host ⇄ renderer
├── MainWindow.R4.cs           اکشن‌های توسعه‌یافته (گزارش، مظنه، ترازو، کاربر)
├── Dialogs/                   ثبت‌نام، ورود و تغییر رمز
├── Core/                      منطق محاسبات عیار، رمزنگاری، دیکدر ترازو، خودآزمایی‌ها
├── Models/                    ScaleSettings، GoldQuoteSettings، ReportRequest
├── Services/                  ترازو (Serial)، گزارش XLSX، تنظیمات، سرویس مظنه
├── Renderer/                  رابط کاربری HTML/CSS/JS (بارگذاری از app.goldbar)
└── Installer/GoldBar.iss      نصب‌کننده Inno Setup
archive/renderer-legacy/       نسخه‌های قدیمی رندرر (مرجع)
.github/workflows/             بیلد، خودآزمایی و انتشار نصب‌کننده
```

## 🔨 بیلد از سورس

پیش‌نیازها: [NET 10 SDK.](https://dotnet.microsoft.com/) و ویندوز ۱۰ (17763+) با معماری x64

```powershell
dotnet restore src/GoldBar.Windows/GoldBar.Windows.csproj -r win-x64
dotnet publish src/GoldBar.Windows/GoldBar.Windows.csproj -c Release -r win-x64 --self-contained true -o publish
./publish/GoldBar.exe
```

ساخت نصب‌کننده کامل (خودآزمایی + Inno Setup) به‌صورت خودکار توسط
[GitHub Actions](.github/workflows/windows-build.yml) انجام می‌شود و خروجی
`GoldBar-Setup-v2.0.0-r12.exe` به‌عنوان Artifact منتشر می‌گردد.

## ✅ تضمین کیفیت

هر بیلد به‌صورت خودکار این مراحل را طی می‌کند:

1. **خودآزمایی منطق** — فرمول‌های مرجع اکسل، پارسر وزن ترازو، رمزنگاری، گزارش XLSX
2. **خودآزمایی رابط کاربری** — ناوبری، محاسبات، اعداد فارسی، چیدمان در ۷ رزولوشن
3. **اعتبارسنجی ثبت‌نام اولیه** و چرخه کامل نصب/حذف نصب‌کننده

## 📄 مجوز

تمام حقوق برای Amirnourhan محفوظ است.
