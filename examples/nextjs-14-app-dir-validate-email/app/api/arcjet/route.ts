import arcjet, { validateEmail } from "@arcjet/next";
import { NextResponse } from "next/server";

const aj = arcjet({
  key: "ajkey_yourkey",
  rules: [
    validateEmail({
      mode: "LIVE",
      block: ["NO_MX_RECORDS"],
    }),
  ],
});

export async function GET(req: Request) {
  const decision = await aj.protect(req, {
    email: "test@arcjet.co",
  });

  if (decision.isDenied()) {
    return NextResponse.json(
      {
        error: "Forbidden",
      },
      {
        status: 403,
      },
    );
  }

  return NextResponse.json({
    message: "Hello world",
  });
}