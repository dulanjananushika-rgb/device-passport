import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/auth";
import { canViewFinance } from "../../../../lib/operations";
import {
  recordPettyCashExpense,
  listPettyCashExpenses,
  deletePettyCashExpense,
  pettyCashCategories,
  type PettyCashCategory,
} from "../../../../lib/petty-cash";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canViewFinance(session.role)) {
    return NextResponse.json({ error: "Access denied to finance & settlement." }, { status: 403 });
  }

  const url = new URL(request.url);
  const dateIso = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);

  try {
    const expenses = listPettyCashExpenses(dateIso);
    return NextResponse.json({ expenses, categories: pettyCashCategories });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load petty cash expenses." },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canViewFinance(session.role)) {
    return NextResponse.json({ error: "Your role cannot record petty cash outflows." }, { status: 403 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Expense details are required." }, { status: 400 });
  }

  try {
    const expense = recordPettyCashExpense(
      {
        settlementDate: payload.settlementDate ? String(payload.settlementDate) : undefined,
        category: (payload.category as PettyCashCategory) || "Other Expenses",
        description: String(payload.description || ""),
        amountLkr: String(payload.amountLkr || "0"),
        paidTo: String(payload.paidTo || ""),
        receiptVoucherRef: payload.receiptVoucherRef ? String(payload.receiptVoucherRef) : undefined,
      },
      session.name || session.email
    );
    return NextResponse.json({ expense }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to record expense." },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canViewFinance(session.role)) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Expense ID is required." }, { status: 400 });

  try {
    deletePettyCashExpense(id, session.name || session.email);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete expense." },
      { status: 400 }
    );
  }
}
