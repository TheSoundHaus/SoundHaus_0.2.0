"use server";

// All user-triggered auth actions such as signup, signin, logout
import { SignupFormSchema, type FormState } from "@/lib/zod/authDefinition";
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
