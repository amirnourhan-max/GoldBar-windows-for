using System.Windows;
using GoldBar.Windows.Core;

namespace GoldBar.Windows;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        if (e.Args.Any(a => string.Equals(a, "--self-test", StringComparison.OrdinalIgnoreCase)))
        {
            var baseExit = SelfTest.Run(Console.Out);
            var r4Exit = R4SelfTest.Run(Console.Out);
            var r11Exit = R11SelfTest.Run(Console.Out);
            Shutdown(baseExit == 0 && r4Exit == 0 && r11Exit == 0 ? 0 : 1);
            return;
        }

        var uiSelfTest = e.Args.Any(a => string.Equals(a, "--ui-self-test", StringComparison.OrdinalIgnoreCase));
        if (uiSelfTest)
        {
            CurrentUser.Username = "self-test";
            _ = Task.Run(async () =>
            {
                await Task.Delay(TimeSpan.FromSeconds(20));
                try
                {
                    Dispatcher.Invoke(() =>
                    {
                        Console.Error.WriteLine("UI-SELF-TEST: WATCHDOG TIMEOUT");
                        Shutdown(2);
                    });
                }
                catch { }
            });
        }
        else
        {
            ShutdownMode = ShutdownMode.OnExplicitShutdown;
            var credentials = new CredentialStore();

            if (!credentials.IsRegistered)
            {
                var registration = new RegistrationDialog(credentials);
                if (registration.ShowDialog() != true)
                {
                    Shutdown(0);
                    return;
                }
                CurrentUser.Username = registration.RegisteredUsername;
            }
            else
            {
                var login = new LoginDialog(credentials);
                if (login.ShowDialog() != true)
                {
                    Shutdown(0);
                    return;
                }
                CurrentUser.Username = login.LoggedInUsername;
            }

            ShutdownMode = ShutdownMode.OnMainWindowClose;
        }

        var window = new MainWindow(uiSelfTest);
        MainWindow = window;
        window.Show();
    }
}
