using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using GoldBar.Windows.Core;

namespace GoldBar.Windows;

public sealed class LoginDialog : Window
{
    private readonly CredentialStore _store;
    private readonly TextBox _username = new();
    private readonly PasswordBox _password = new();
    private readonly TextBlock _error = new();

    public string LoggedInUsername { get; private set; } = string.Empty;

    public LoginDialog(CredentialStore store)
    {
        _store = store;
        Title = "GOLD BAR Login";
        Width = 430;
        Height = 330;
        MinWidth = 430;
        MinHeight = 330;
        MaxWidth = 430;
        MaxHeight = 330;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        ResizeMode = ResizeMode.NoResize;
        WindowStyle = WindowStyle.None;
        Background = Brushes.Transparent;
        AllowsTransparency = true;
        ShowInTaskbar = true;
        Topmost = true;

        var gold = new SolidColorBrush(Color.FromRgb(232, 187, 75));
        var bg = new SolidColorBrush(Color.FromRgb(10, 12, 15));
        var panel = new SolidColorBrush(Color.FromRgb(20, 23, 28));
        var text = new SolidColorBrush(Color.FromRgb(244, 241, 233));
        var muted = new SolidColorBrush(Color.FromRgb(155, 162, 174));

        var root = new Border
        {
            Background = bg,
            BorderBrush = new SolidColorBrush(Color.FromArgb(150, 232, 187, 75)),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(16),
            Padding = new Thickness(26)
        };
        root.MouseLeftButtonDown += (_, e) => { if (e.ButtonState == MouseButtonState.Pressed) DragMove(); };

        var stack = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
        root.Child = stack;

        stack.Children.Add(new TextBlock
        {
            Text = "GOLD BAR",
            Foreground = gold,
            FontWeight = FontWeights.ExtraBold,
            FontSize = 30,
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 0, 0, 2)
        });
        stack.Children.Add(new TextBlock
        {
            Text = "by: Amirnourhan",
            Foreground = muted,
            FontWeight = FontWeights.Bold,
            FontSize = 12,
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 0, 0, 22)
        });

        stack.Children.Add(Label("نام کاربری", muted));
        _username.Height = 40;
        _username.Background = panel;
        _username.Foreground = text;
        _username.BorderBrush = new SolidColorBrush(Color.FromRgb(58, 62, 68));
        _username.BorderThickness = new Thickness(1);
        _username.FontSize = 14;
        _username.FontWeight = FontWeights.Bold;
        _username.Padding = new Thickness(10, 7, 10, 7);
        _username.Text = _store.RegisteredUsername;
        _username.Margin = new Thickness(0, 0, 0, 12);
        _username.FlowDirection = FlowDirection.RightToLeft;
        stack.Children.Add(_username);

        stack.Children.Add(Label("رمز عبور", muted));
        _password.Height = 40;
        _password.Background = panel;
        _password.Foreground = text;
        _password.BorderBrush = new SolidColorBrush(Color.FromRgb(58, 62, 68));
        _password.BorderThickness = new Thickness(1);
        _password.FontSize = 14;
        _password.FontWeight = FontWeights.Bold;
        _password.Padding = new Thickness(10, 7, 10, 7);
        _password.Margin = new Thickness(0, 0, 0, 8);
        _password.KeyDown += (_, e) => { if (e.Key == Key.Enter) TryLogin(); };
        stack.Children.Add(_password);

        _error.Text = " ";
        _error.Foreground = new SolidColorBrush(Color.FromRgb(255, 132, 132));
        _error.FontWeight = FontWeights.Bold;
        _error.FontSize = 11;
        _error.TextAlignment = TextAlignment.Right;
        _error.FlowDirection = FlowDirection.RightToLeft;
        _error.Margin = new Thickness(0, 0, 0, 10);
        stack.Children.Add(_error);

        var actions = new Grid();
        actions.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        actions.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(12) });
        actions.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

        var exit = new Button
        {
            Content = "خروج", Height = 42, Background = panel, Foreground = text,
            BorderBrush = new SolidColorBrush(Color.FromRgb(70, 74, 82)), BorderThickness = new Thickness(1),
            FontWeight = FontWeights.Bold, Cursor = Cursors.Hand
        };
        exit.Click += (_, _) => { DialogResult = false; Close(); };
        Grid.SetColumn(exit, 0);
        actions.Children.Add(exit);

        var login = new Button
        {
            Content = "ورود", Height = 42, Background = gold,
            Foreground = new SolidColorBrush(Color.FromRgb(22, 18, 9)), BorderBrush = gold,
            BorderThickness = new Thickness(1), FontWeight = FontWeights.ExtraBold, Cursor = Cursors.Hand
        };
        login.Click += (_, _) => TryLogin();
        Grid.SetColumn(login, 2);
        actions.Children.Add(login);

        stack.Children.Add(actions);
        Content = root;

        Loaded += (_, _) => { _password.Focus(); Keyboard.Focus(_password); };
    }

    private static TextBlock Label(string value, Brush color) => new()
    {
        Text = value,
        Foreground = color,
        FontWeight = FontWeights.Bold,
        FontSize = 12,
        FlowDirection = FlowDirection.RightToLeft,
        TextAlignment = TextAlignment.Right,
        Margin = new Thickness(0, 0, 0, 5)
    };

    private void TryLogin()
    {
        if (_store.Verify(_username.Text, _password.Password))
        {
            LoggedInUsername = _store.RegisteredUsername;
            DialogResult = true;
            Close();
            return;
        }

        _error.Text = "نام کاربری یا رمز عبور اشتباه است.";
        _password.Clear();
        _password.Focus();
    }
}
