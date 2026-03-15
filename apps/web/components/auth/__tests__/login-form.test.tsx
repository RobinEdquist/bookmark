import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, userEvent, waitFor } from "../../../__test-utils__/render";
import { LoginForm } from "../login-form";

const { mockSignIn, mockToast } = vi.hoisted(() => ({
  mockSignIn: vi.fn(),
  mockToast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("../../../lib/auth-client", () => ({
  authClient: {
    signIn: {
      email: (...args: unknown[]) => mockSignIn(...args),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: mockToast,
}));

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignIn.mockResolvedValue({ data: { user: { id: "1" } } });
  });

  it("renders email and password fields", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText("emailLabel")).toBeInTheDocument();
    expect(screen.getByLabelText("passwordLabel")).toBeInTheDocument();
  });

  it("renders submit button", () => {
    render(<LoginForm />);
    expect(screen.getByRole("button", { name: "submit" })).toBeInTheDocument();
  });

  it("allows typing in email field", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    const emailInput = screen.getByLabelText("emailLabel");
    await user.type(emailInput, "test@example.com");

    expect(emailInput).toHaveValue("test@example.com");
  });

  it("allows typing in password field", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    const passwordInput = screen.getByLabelText("passwordLabel");
    await user.type(passwordInput, "password123");

    expect(passwordInput).toHaveValue("password123");
  });

  it("calls signIn on form submit", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText("emailLabel"), "test@example.com");
    await user.type(screen.getByLabelText("passwordLabel"), "password123");
    await user.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith({
        email: "test@example.com",
        password: "password123",
      });
    });
  });

  it("shows error toast on sign in failure", async () => {
    mockSignIn.mockResolvedValue({ error: { message: "Invalid credentials" } });

    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText("emailLabel"), "test@example.com");
    await user.type(screen.getByLabelText("passwordLabel"), "wrong");
    await user.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("error.invalid");
    });
  });

  it("shows connection error on network failure", async () => {
    mockSignIn.mockRejectedValue(new Error("Network error"));

    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText("emailLabel"), "test@example.com");
    await user.type(screen.getByLabelText("passwordLabel"), "pass");
    await user.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("error.connection");
    });
  });

  it("disables inputs while loading", async () => {
    // Make signIn hang
    mockSignIn.mockReturnValue(new Promise(() => {}));

    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText("emailLabel"), "test@example.com");
    await user.type(screen.getByLabelText("passwordLabel"), "pass");
    await user.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() => {
      expect(screen.getByLabelText("emailLabel")).toBeDisabled();
      expect(screen.getByLabelText("passwordLabel")).toBeDisabled();
    });
  });
});
