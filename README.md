# GOLD BAR for Windows

نسخه نهایی نرم‌افزار مدیریت آبشده و محاسبات عیار طلا برای ویندوز، ساخته‌شده با WPF (.NET 10) و WebView2.

**وضعیت پروژه: Final / Closed**  
نسخه نهایی: **v2.0.0 R12 Final**

## دانلود نسخه نهایی

Installer رسمی از بخش Releases:

[Download GOLD BAR v2.0.0 R12 Final](https://github.com/amirnourhan-max/GoldBar-windows-for/releases/tag/v2.0.0-r12-final)

نام فایل نصب:
`GoldBar-Setup-v2.0.0-r12.exe`

## امکانات نهایی

- ثبت و مدیریت آبشده‌ها با ورود وزن دستی یا ترازو
- محاسبات عیار، افزایش عیار، نقره و بار مورد نیاز
- محاسبه سریع و هزینه عیار
- دریافت مظنه طلا و نقره
- ذخیره گزارش کامل در یک فایل Excel شامل ۵ شیت
- ورود گزارش با **جایگزینی کامل اطلاعات کاری** شامل آبشده‌ها، عیار، افزایش عیار، محاسبه سریع و هزینه عیار
- تنظیمات ترازو، مظنه و اطلاعات عمومی برنامه مستقل از Import گزارش
- ثبت‌نام اولیه، ورود و تغییر رمز
- Installer ویندوز x64 با WebView2 bootstrapper

## ساختار پروژه

```text
.github/workflows/             CI، تست و ساخت Installer
src/GoldBar.Windows/
├── Core/                      منطق و self-testها
├── Dialogs/                   ثبت‌نام، ورود و تغییر رمز
├── Models/                    مدل‌های داده
├── Services/                  ترازو، گزارش، مظنه و تنظیمات
├── Renderer/                  رابط کاربری HTML/CSS/JS
├── Installer/                 Inno Setup
├── App.xaml(.cs)
├── MainWindow.xaml(.cs)
└── GoldBar.Windows.csproj
```

نسخه‌های قدیمی و فایل‌های موقت از شاخه اصلی حذف شده‌اند؛ تاریخچه کامل تغییرات در Git محفوظ است.

## Build from source

پیش‌نیازها: Windows x64 و .NET 10 SDK.

```powershell
dotnet restore src/GoldBar.Windows/GoldBar.Windows.csproj -r win-x64
dotnet publish src/GoldBar.Windows/GoldBar.Windows.csproj -c Release -r win-x64 --self-contained true -o publish
./publish/GoldBar.exe
```

## تضمین کیفیت

GitHub Actions در Build نهایی این موارد را بررسی می‌کند:

1. compiled software self-test
2. UI / calculation / resolution self-test
3. first-run registration startup
4. ساخت Installer
5. نصب Silent و retest نسخه نصب‌شده
6. Uninstall و reset ثبت‌نام
7. SHA256 و انتشار Installer

## مالکیت

تمام حقوق برای **Amirnourhan** محفوظ است.
