"use client";

import { useState } from "react";
import Link from "next/link";
import { TodoRow, type TodoItem } from "@/components/ThreadTodos";

export type TodayTodo = TodoItem & { customerId: string | null; customerName: string };

// 「今日やること」のやること一覧。チェックすると完了（その場では取り消し線で残す）。
export default function TodayTodoList({ initialTodos, emptyText }: { initialTodos: TodayTodo[]; emptyText: string }) {
  const [todos, setTodos] = useState(initialTodos);
  if (todos.length === 0) return <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)" }}>{emptyText}</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {todos.map((t) => (
        <div key={t.id} style={{ padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--color-surface)", border: "1px solid var(--color-divider)" }}>
          <TodoRow
            todo={t}
            onChange={(next) => setTodos((prev) => prev.map((x) => (x.id === next.id ? { ...x, ...next } : x)))}
            onDelete={(id) => setTodos((prev) => prev.filter((x) => x.id !== id))}
            extra={
              t.customerId ? (
                <>
                  ・
                  <Link href={`/customers/${t.customerId}`} style={{ color: "var(--color-accent)" }}>
                    {t.customerName}
                  </Link>
                </>
              ) : null
            }
          />
        </div>
      ))}
    </div>
  );
}
