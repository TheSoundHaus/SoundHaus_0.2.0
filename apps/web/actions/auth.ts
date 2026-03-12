"use server";

// All user-triggered auth actions such as signup, signin, logout
import { SignupFormSchema, LoginFormSchema, type FormState, type LoginFormState } from "@/lib/zod/authDefinition";
import { redirect } from "next/navigation";
import { setAuthCookies } from "@/lib/utils/auth";

const API_BASE_URL = process.env.API_URL || "http://localhost:8000";

export async function signup(
  state: FormState,
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
  state: LoginFormState,
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
