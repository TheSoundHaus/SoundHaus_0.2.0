"use server";

// All user-triggered auth actions such as signup, Login, logout
import {
  LoginFormSchema,
  SignupFormSchema,
  type FormState as SignUpFormState,
  type LoginFormState,
} from "@/lib/zod/authDefinition";
import { redirect } from "next/navigation";
import { clearAuthCookies, getAccessToken, setAuthCookies } from "@/lib/utils/authUtil";


const API_BASE_URL = process.env.API_URL || "http://129.212.182.247:8000";

export async function signup(
  _prevState: SignUpFormState,
  formData: FormData,
): Promise<SignUpFormState> {
  // Validate form fields
  const validatedFields = SignupFormSchema.safeParse({
    username: formData.get("username"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword")
  })

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors };
  }

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
        metadata: { username },
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
    console.log("Gitea user provisioned:", data.gitea);

    // Store session tokens using utility function
    if (data.success && data.supabase?.session) {
      const { access_token, refresh_token, expires_in } = data.supabase.session;
      await setAuthCookies(access_token, refresh_token, expires_in);

      // Gitea credentials fetch disabled for web-only flow
      // Users don't need git credentials for web-based operations
      // Note: Re-enable this for Desktop app or local git access features
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
  _prevState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
    const validatedFields = LoginFormSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  })

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors };
  }

  const { email, password } = validatedFields.data;

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type" : "application/json"
      },
      body: JSON.stringify({
        email,
        password,
      })
    })

    const data = await response.json()

    if (!response.ok || !data.success) {
      console.error("Login failed:", data);
      return {
        message:
          data.message ||
          data.supabase?.message ||
          "Login failed. Please try again.",
      };
    }

    console.log("✅ User logged in successfully!");

    if (data.success && data.session) {
      const { access_token, refresh_token, expires_in } = data.session;
      await setAuthCookies(access_token, refresh_token, expires_in);

      // Gitea credentials fetch disabled for web-only flow
      // Users don't need git credentials for web-based operations
      // Note: Re-enable this for Desktop app or local git access features
    }
  } catch (error) {
    console.error("Login error:", error);
    return {
      message: "An error occurred during Login. Please try again.",
    };
  }
  redirect("/dashboard");
}

export async function logout() {
  const bearer = await getAccessToken();
  // logout server side
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type" : "application/json",
        "Authorization": `Bearer ${bearer}`
      },
    })

    const data = await response.json()

    if (!response.ok || !data.success) {
      console.error("Logout failed:", data);
      console.warn(
        "Logout warning:",
        data.message ||
        data.supabase?.message ||
        "Logout failed. Please try again."
      );
    } else {
      console.log("✅ User logged out successfully!");
    }
  } catch (error) {
    console.error("Logout error:", error);
    console.warn("An error occurred during logout. Clearing local session anyway.");
  }

  // clear local cookies store (always do this even if backend fails)
  await clearAuthCookies()

  // redirect to login
  redirect("/");
}