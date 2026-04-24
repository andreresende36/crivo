"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const ITEMS = [
  { label: "Dashboard", href: "/" },
  { label: "Ofertas", href: "/offers" },
  { label: "Fila de Envio", href: "/queue" },
  { label: "Analytics", href: "/analytics" },
  { label: "Config", href: "/settings" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="lg:hidden inline-flex items-center justify-center rounded-lg h-9 w-9 hover:bg-muted transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
      </SheetTrigger>
      <SheetContent side="left" className="w-[260px] p-0">
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-border">
          <Image src="/icon.png" alt="Crivo Icon" width={32} height={32} unoptimized />
          <span className="font-display font-extrabold tracking-widest text-lg">
            <span className="text-[#09090B] dark:text-[#E4E4E7]">CRI</span>
            <span className="text-[#A78BFA]">VO</span>
          </span>
        </div>
        <nav className="px-3 py-4 space-y-1">
          {ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                pathname === item.href
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/10"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
