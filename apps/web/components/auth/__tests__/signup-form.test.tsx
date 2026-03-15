import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, userEvent, waitFor } from "../../../__test-utils__/render";
import { SignupForm } from "../signup-form";

const { mockSignUp, mockToast } = vi.hoisted(() => ({
  mockSignUp: vi.fn(),
  mockToast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("../../../lib/auth-client", () => ({
  authClient: {
    signUp: {
      email: (...args: unknown[]) => mockSignUp(...args),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: mockToast,
}));

describe("SignupForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignUp.mockResolvedValue({ data: { user: { id: "1" } } });
  });

  it("renders name, email, and password fields", () => {
    render(<SignupForm />);
    expect(screen.getByLabelText("nameLabel")).toBeInTheDocument();
    expect(screen.getByLabelText("emailLabel")).toBeInTheDocument();
    expect(screen.getByLabelText("passwordLabel")).toBeInTheDocument();
  });

  it("renders submit button", () => {
    render(<SignupForm />);
    expect(screen.getByRole("button", { name: "submit" })).toBeInTheDocument();
  });

  it("calls signUp on form submit", async () => {
    const user = userEvent.setup();
    render(<SignupForm />);

    await user.type(screen.getByLabelText("nameLabel"), "Test User");
    await user.type(screen.getByLabelText("emailLabel"), "test@example.com");
    await user.type(screen.getByLabelText("passwordLabel"), "password123");
    await user.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith({
        email: "test@example.com",
        password: "password123",
        name: "Test User",
      });
    });
  });

  it("shows error for existing email", async () => {
    mockSignUp.mockResolvedValue({
      error: { message: "User already exists" },
    });

    const user = userEvent.setup();
    render(<SignupForm />);

    await user.type(screen.getByLabelText("nameLabel"), "Test");
    await user.type(screen.getByLabelText("emailLabel"), "existing@test.com");
    await user.type(screen.getByLabelText("passwordLabel"), "password123");
    await user.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("error.emailExists");
    });
  });

  it("shows error when signups are closed", async () => {
    mockSignUp.mockResolvedValue({
      error: { message: "Sign up is disabled" },
    });

    const user = userEvent.setup();
    render(<SignupForm />);

    await user.type(screen.getByLabelText("nameLabel"), "Test");
    await user.type(screen.getByLabelText("emailLabel"), "test@test.com");
    await user.type(screen.getByLabelText("passwordLabel"), "password123");
    await user.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("error.signupsClosed");
    });
  });

  it("shows generic error for unknown server errors", async () => {
    mockSignUp.mockResolvedValue({
      error: { message: "Something weird happened" },
    });

    const user = userEvent.setup();
    render(<SignupForm />);

    await user.type(screen.getByLabelText("nameLabel"), "Test");
    await user.type(screen.getByLabelText("emailLabel"), "test@test.com");
    await user.type(screen.getByLabelText("passwordLabel"), "password123");
    await user.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Something weird happened");
    });
  });

  it("shows connection error on network failure", async () => {
    mockSignUp.mockRejectedValue(new Error("Network error"));

    const user = userEvent.setup();
    render(<SignupForm />);

    await user.type(screen.getByLabelText("nameLabel"), "Test");
    await user.type(screen.getByLabelText("emailLabel"), "test@test.com");
    await user.type(screen.getByLabelText("passwordLabel"), "password123");
    await user.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("error.connection");
    });
  });

  it("password field has minLength of 8", () => {
    render(<SignupForm />);
    const passwordInput = screen.getByLabelText("passwordLabel");
    expect(passwordInput).toHaveAttribute("minLength", "8");
  });
});
