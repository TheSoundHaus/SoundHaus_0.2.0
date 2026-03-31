"use server";

// All user-triggered auth actions such as signup, signin, logout
import { SignupFormSchema, LoginFormSchema, type FormState, type LoginFormState } from "@/lib/zod/authDefinition";
import { redirect } from "next/navigation";
import { setAuthCookies, getAccessToken, clearAuthCookies } from "@/lib/utils/auth";

const API_BASE_URL = process.env.API_URL || "http://129.212.182.247:8000";

export async function signup(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  // Validate form fields
  const validatedFields = SignupFormSchema.safeParse({
    username: formData.get("username"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  // If any form fields are invalid, return early
  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  // Extract validated data
  const { username, email, password } = validatedFields.data;

  try {
    // Call FastAPI backend signup endpoint
    const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        name: username,
        metadata: {
          username,
        },
      }),
    });

    const data = await response.json();

    // If signup failed, return error
    if (!response.ok || !data.success) {
      console.error("Signup failed:", data);
      return {
        message:
          data.message ||
          data.supabase?.message ||
          "Signup failed. Please try again.",
      };
    }

    console.log("✅ User created successfully!");
    console.log("Supabase:", data.supabase);
    console.log("Gitea:", data.gitea);

    // Store session tokens using utility function
    if (data.success && data.supabase?.session) {
      const { access_token, refresh_token, expires_in } = data.supabase.session;
      await setAuthCookies(access_token, refresh_token, expires_in);
      console.log("Cookies set:", data.gitea);
    }
  } catch (error) {
    console.error("Signup error:", error);
    return {
      message: "An error occurred during signup. Please try again.",
    };
  }

  // Redirect to dashboard on success
  redirect("/dashboard");
}

export async function login(
  _state: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  // Validate form fields
  const validatedFields = LoginFormSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  // If any form fields are invalid, return early
  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  const { email, password } = validatedFields.data;

  try {
    // Call FastAPI backend login endpoint
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    // If login failed, return error
    if (!response.ok || !data.success) {
      console.error("Login failed:", data);
      return {
        message:
          data.message || "Login failed. Please check your credentials.",
      };
    }

    console.log("✅ Login successful!");

    // Store session tokens using utility function
    if (data.session) {
      const { access_token, refresh_token, expires_at } = data.session;
      // expires_at is a Unix timestamp; calculate seconds remaining
      const expiresIn = expires_at
        ? Math.max(0, expires_at - Math.floor(Date.now() / 1000))
        : undefined;
      await setAuthCookies(access_token, refresh_token, expiresIn);
    }
  } catch (error) {
    console.error("Login error:", error);
    return {
      message: "An error occurred during login. Please try again.",
    };
  }

  // Redirect to dashboard on success
  redirect("/dashboard");
}

/**
 * Logout – revokes the session token on the backend and clears cookies.
 */
export async function logout(): Promise<{ error?: string }> {
  try {
    const token = await getAccessToken();

    if (token) {
      // Tell the backend to revoke the session
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
    }

    // Always clear cookies, even if the backend call fails
    await clearAuthCookies();
  } catch (error) {
    console.error("Logout error:", error);
    // Still clear cookies on error so the user isn't stuck
    await clearAuthCookies();
  }

  redirect("/login");
}

/**
 * Request a password reset email via Supabase.
 */
export async function requestPasswordResetAction(
  email: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      return { success: false, error: data.detail || data.message || "Failed to send reset email." };
    }
    return { success: true };
  } catch (error) {
    console.error("Password reset error:", error);
    return { success: false, error: "An error occurred. Please try again." };
  }
}
