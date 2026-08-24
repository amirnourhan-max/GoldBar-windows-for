using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using GoldBar.Windows.Core;

namespace GoldBar.Windows;

public sealed class ChangePasswordDialog : Window
{
    private readonly CredentialStore _store;
    private readonly string _username;
    private readonly PasswordBox _current = new();
    private readonly PasswordBox _next = new();
    private readonly PasswordBox _confirm = new();
    private readonly TextBlock _error = new();

    public ChangePasswordDialog(CredentialStore store, string username)
    {
        _store = store;
        _username = username;
        Title = "GOLD BAR - Change Password";
        Width = 450;
        Height = 440;
        MinWidth = MaxWidth = 450;
        MinHeight = MaxHeight = 440;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        ResizeMode = ResizeMode.NoResize;
        WindowStyle = WindowStyle.None;
        Background = Brushes.Transparent;
        AllowsTransparency = true;
        ShowInTaskbar = false;

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
            Text = "تغییر رمز عبور",
            Foreground = gold,
            FontWeight = FontWeights.ExtraBold,
            FontSize = 24,
            HorizontalAlignment = HorizontalAlignment.Center,
            FlowDirection = FlowDirection.RightToLeft
        });
        stack.Children.Add(new TextBlock
        {
            Text = $"کاربر: {_username}",
            Foreground = text,
            FontWeight = FontWeights.Bold,
            FontSize = 12,
            HorizontalAlignment = HorizontalAlignment.Center,
            FlowDirection = FlowDirection.RightToLeft,
            Margin = new Thickness(0, 5, 0, 20)
        });

        AddPasswordField(stack, "رمز عبور فعلی", _current, panel, text, muted);
        AddPasswordField(stack, "رمز عبور جدید", _next, panel, text, muted);
        AddPasswordField(stack, "تکرار رمز عبور جدید", _confirm, panel, text, muted);
        _confirm.KeyDown += (_, e) => { if (e.Key == Key.Enter) TryChange(); };

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

        var cancel = MakeButton("انصراف", panel, text, new SolidColorBrush(Color.FromRgb(70, 74, 82)));
        cancel.Click += (_, _) => { DialogResult = false; Close(); };
        Grid.SetColumn(cancel, 0);
        actions.Children.Add(cancel);

        var save = MakeButton("ذخیره رمز جدید", gold, new SolidColorBrush(Color.FromRgb(22, 18, 9)), gold);
        save.Click += (_, _) => TryChange();
        Grid.SetColumn(save, 2);
        actions.Children.Add(save);

        stack.Children.Add(actions);
        Content = root;
        Loaded += (_, _) => { _current.Focus(); Keyboard.Focus(_current); };
    }

    private static void AddPasswordField(Panel parent, string title, PasswordBox box, Brush panel, Brush text, Brush muted)
    {
        parent.Children.Add(new TextBlock
        {
            Text = title,
            Foreground = muted,
            FontWeight = FontWeights.Bold,
            FontSize = 12,
            FlowDirection = FlowDirection.RightToLeft,
            TextAlignment = TextAlignment.Right,
            Margin = new Thickness(0, 0, 0, 5)
        });
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

    private static Button MakeButton(string value, Brush background, Brush foreground, Brush border) => new()
    {
        Content = value,
        Height = 42,
        Background = background,
        Foreground = foreground,
        BorderBrush = border,
        BorderThickness = new Thickness(1),
        FontWeight = FontWeights.ExtraBold,
        Cursor = Cursors.Hand
    };

    private void TryChange()
    {
        if (!string.Equals(_next.Password, _confirm.Password, StringComparison.Ordinal))
        {
            _error.Text = "تکرار رمز جدید با رمز جدید یکسان نیست.";
            _confirm.Clear();
            _confirm.Focus();
            return;
        }

        try
        {
            _store.ChangePassword(_username, _current.Password, _next.Password);
            DialogResult = true;
            Close();
        }
        catch (Exception ex)
        {
            _error.Text = ex.Message;
        }
    }
}
