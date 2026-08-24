using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using GoldBar.Windows.Core;

namespace GoldBar.Windows;

public sealed class RegistrationDialog : Window
{
    private readonly CredentialStore _store;
    private readonly TextBox _username = new();
    private readonly PasswordBox _password = new();
    private readonly PasswordBox _confirm = new();
    private readonly TextBlock _error = new();

    public string RegisteredUsername { get; private set; } = string.Empty;

    public RegistrationDialog(CredentialStore store)
    {
        _store = store;
        Title = "GOLD BAR Registration";
        Width = 470;
        Height = 470;
        MinWidth = 470;
        MinHeight = 470;
        MaxWidth = 470;
        MaxHeight = 470;
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
            Padding = new Thickness(28)
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
            HorizontalAlignment = HorizontalAlignment.Center
        });
        stack.Children.Add(new TextBlock
        {
            Text = "ثبت‌نام اولیه نرم‌افزار",
            Foreground = text,
            FontWeight = FontWeights.ExtraBold,
            FontSize = 15,
            HorizontalAlignment = HorizontalAlignment.Center,
            FlowDirection = FlowDirection.RightToLeft,
            Margin = new Thickness(0, 4, 0, 4)
        });
        stack.Children.Add(new TextBlock
        {
            Text = "این مرحله فقط یک‌بار انجام می‌شود. نام کاربری و رمز دلخواه خودت را بساز.",
            Foreground = muted,
            FontWeight = FontWeights.Bold,
            FontSize = 11,
            TextAlignment = TextAlignment.Center,
            TextWrapping = TextWrapping.Wrap,
            FlowDirection = FlowDirection.RightToLeft,
            Margin = new Thickness(0, 0, 0, 20)
        });

        AddTextField(stack, "نام کاربری", _username, panel, text, muted);
        AddPasswordField(stack, "رمز عبور", _password, panel, text, muted);
        AddPasswordField(stack, "تکرار رمز عبور", _confirm, panel, text, muted);
        _confirm.KeyDown += (_, e) => { if (e.Key == Key.Enter) TryRegister(); };

        _error.Text = " ";
        _error.Foreground = new SolidColorBrush(Color.FromRgb(255, 132, 132));
        _error.FontWeight = FontWeights.Bold;
        _error.FontSize = 11;
        _error.TextAlignment = TextAlignment.Right;
        _error.FlowDirection = FlowDirection.RightToLeft;
        _error.Margin = new Thickness(0, 2, 0, 10);
        stack.Children.Add(_error);

        var actions = new Grid();
        actions.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        actions.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(12) });
        actions.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

        var exit = MakeButton("خروج", panel, text, new SolidColorBrush(Color.FromRgb(70, 74, 82)));
        exit.Click += (_, _) => { DialogResult = false; Close(); };
        Grid.SetColumn(exit, 0);
        actions.Children.Add(exit);

        var register = MakeButton("ثبت‌نام و ورود", gold, new SolidColorBrush(Color.FromRgb(22, 18, 9)), gold);
        register.Click += (_, _) => TryRegister();
        Grid.SetColumn(register, 2);
        actions.Children.Add(register);
        stack.Children.Add(actions);

        Content = root;
        Loaded += (_, _) => { _username.Focus(); Keyboard.Focus(_username); };
    }

    private static void AddTextField(Panel parent, string title, TextBox box, Brush panel, Brush text, Brush muted)
    {
        parent.Children.Add(Label(title, muted));
        box.Height = 40;
        box.Background = panel;
        box.Foreground = text;
        box.BorderBrush = new SolidColorBrush(Color.FromRgb(58, 62, 68));
        box.BorderThickness = new Thickness(1);
        box.FontSize = 14;
        box.FontWeight = FontWeights.Bold;
        box.Padding = new Thickness(10, 7, 10, 7);
        box.Margin = new Thickness(0, 0, 0, 12);
        box.FlowDirection = FlowDirection.RightToLeft;
        parent.Children.Add(box);
    }

    private static void AddPasswordField(Panel parent, string title, PasswordBox box, Brush panel, Brush text, Brush muted)
    {
        parent.Children.Add(Label(title, muted));
        box.Height = 40;
        box.Background = panel;
        box.Foreground = text;
        box.BorderBrush = new SolidColorBrush(Color.FromRgb(58, 62, 68));
        box.BorderThickness = new Thickness(1);
        box.FontSize = 14;
        box.FontWeight = FontWeights.Bold;
        box.Padding = new Thickness(10, 7, 10, 7);
        box.Margin = new Thickness(0, 0, 0, 12);
        parent.Children.Add(box);
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

    private static Button MakeButton(string text, Brush background, Brush foreground, Brush border) => new()
    {
        Content = text,
        Height = 42,
        Background = background,
        Foreground = foreground,
        BorderBrush = border,
        BorderThickness = new Thickness(1),
        FontWeight = FontWeights.ExtraBold,
        Cursor = Cursors.Hand
    };

    private void TryRegister()
    {
        var username = _username.Text.Trim();
        var password = _password.Password;
        if (!string.Equals(password, _confirm.Password, StringComparison.Ordinal))
        {
            _error.Text = "تکرار رمز عبور با رمز اصلی یکسان نیست.";
            _confirm.Clear();
            _confirm.Focus();
            return;
        }

        try
        {
            _store.Register(username, password);
            RegisteredUsername = username;
            DialogResult = true;
            Close();
        }
        catch (Exception ex)
        {
            _error.Text = ex.Message;
        }
    }
}
