"use client";

import { ThemeToggle } from "./theme-toggle";
import { MobileNav } from "./mobile-nav";

export function Header() {
  return (
    <div className="sticky top-0 z-30">
      <header className="flex items-center justify-between h-16 px-4 lg:px-6 bg-background">
        <div className="flex items-center gap-3">
          <MobileNav />
        </div>
        <div className="flex items-center gap-2">
          <div className="border border-border rounded-lg">
            <ThemeToggle />
          </div>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 ring-2 ring-border ring-offset-1 ring-offset-background flex items-center justify-center text-primary text-sm font-bold">
            A
          </div>
        </div>
      </header>
      <div className="h-4 bg-gradient-to-b from-background/60 to-transparent pointer-events-none" />
    </div>
  );
}
