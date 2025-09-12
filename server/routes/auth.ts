import { ExpressAuth } from "@auth/express"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { Router } from "express"
import { NextAuthConfig } from "next-auth"
import { db } from "server/lib/db"

export const authConfig: NextAuthConfig = {
  providers: [
    {
      id: "grail",
      name: "Grail Auth",
      type: "oidc",
      clientId: process.env.AUTH_CLIENT_ID,
      clientSecret: process.env.AUTH_CLIENT_SECRET,
      issuer:
        process.env.OIDC_ISSUER_URL ||
        "https://staging.auth.grail.computer/oidc",
      wellKnown: process.env.OIDC_ISSUER_URL
        ? `${process.env.OIDC_ISSUER_URL}/.well-known/openid-configuration`
        : "https://staging.auth.grail.computer/oidc/.well-known/openid-configuration",
      authorization: {
        params: {
          scope: "openid email profile",
          response_type: "code",
        },
      },
      checks: ["state"],
      client: {
        token_endpoint_auth_method: "client_secret_basic",
      },
      profile(profile: any) {
        return {
          id: profile.sub || profile.id,
          name: profile.name,
          email: profile.email,
          image:
            profile.picture ||
            profile.profile_image_url ||
            profile.profileImageUrl,
          emailVerified: profile.email_verified ? new Date() : null,
        }
      },
      // Custom icon for the Grail provider
      style: {
        logo: "https://grail.computer/assets/icon.svg", // Path to your custom icon (can be a URL or relative path)
      },
    },
  ],
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  // register custom login page here
  // pages: {
  //   signIn: "/login",
  // },
  secret: process.env.AUTH_SECRET,
  redirectProxyUrl: process.env.NEXTAUTH_URL + "/api/auth",
  trustHost: true,
  callbacks: {
    authorized({ auth, request }) {
      // Add custom authorization logic here if needed
      return !!auth?.user
    },
    jwt({ token, account, profile }) {
      if (account && profile) {
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
        // Store the OIDC ID in a custom field
        const oidcId = profile.sub || profile.id
        if (oidcId) {
          token.oidcId = oidcId
        }
      }
      return token
    },
    async session({ session, token }) {
      if (token && token.sub) {
        // Look up the user by their OIDC ID to get the Prisma-generated ID
        const user = await db.user.findFirst({
          where: {
            accounts: {
              some: {
                providerAccountId: token.sub,
              },
            },
          },
          select: {
            id: true,
          },
        })
        if (user) {
          session.user.id = user.id
        } else {
          // Fallback: try to find user by email if available
          if (session.user.email) {
            const userByEmail = await db.user.findUnique({
              where: { email: session.user.email },
              select: { id: true },
            })
            if (userByEmail) {
              session.user.id = userByEmail.id
            }
          }
        }
      }
      return session
    },
    redirect({ url, baseUrl }) {
      // Use the NEXTAUTH_URL environment variable as the base URL
      const authUrl = process.env.NEXTAUTH_URL || baseUrl
      if (url.startsWith("/")) {
        return `${authUrl}${url}`
      }
      if (url.startsWith(authUrl)) {
        return url
      }
      return authUrl
    },
  },
  // Configure cookies for iframe compatibility
  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "none", // Allow cross-site requests in iframes
        path: "/",
        secure: true, // Required when sameSite is "none"
      },
    },
    callbackUrl: {
      name: `next-auth.callback-url`,
      options: {
        sameSite: "none",
        path: "/",
        secure: true,
      },
    },
    csrfToken: {
      name: `next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: "none",
        path: "/",
        secure: true,
      },
    },
    pkceCodeVerifier: {
      name: `next-auth.pkce.code_verifier`,
      options: {
        httpOnly: true,
        sameSite: "none",
        path: "/",
        secure: true,
      },
    },
    state: {
      name: `next-auth.state`,
      options: {
        httpOnly: true,
        sameSite: "none",
        path: "/",
        secure: true,
      },
    },
  },
}

const router = Router()
router.use((req, res, next) => {
  if (process.env.NODE_ENV !== "production") {
    // prevent issues due to development environment proxy header rewrites
    req.headers["host"] = process.env.NEXTAUTH_URL?.slice(8)
    req.headers["x-forwarded-proto"] = "https"
  }
  next()
})

router.use(ExpressAuth(authConfig))

export default router
