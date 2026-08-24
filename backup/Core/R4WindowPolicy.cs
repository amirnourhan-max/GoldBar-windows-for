using System.Windows;

namespace GoldBar.Windows.Core;

public static class R4WindowPolicy
{
    public static WindowState StartupState(bool uiSelfTest) =>
        uiSelfTest ? WindowState.Maximized : WindowState.Normal;
}
