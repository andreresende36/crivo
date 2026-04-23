"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Tag, Send, Activity, BarChart2, Settings, ChevronDown, ChevronRight } from "lucide-react";

type NavItem = {
  label: string;
  href?: string;
  icon: React.ReactNode;
  subItems?: { label: string; href: string }[];
};

const NAV_ITEMS: NavItem[] = [
  {
    label: "Visão geral",
    href: "/",
    icon: <LayoutDashboard size={20} />,
  },
  {
    label: "Ofertas",
    href: "/offers",
    icon: <Tag size={20} />,
  },
  {
    label: "Fila de envio",
    href: "/queue",
    icon: <Send size={20} />,
  },
  {
    label: "Monitoramento",
    icon: <Activity size={20} />,
    subItems: [
      {
        label: "Busca de ofertas",
        href: "/monitor/search",
      }
    ]
  },
  {
    label: "Analytics",
    href: "/analytics",
    icon: <BarChart2 size={20} />,
  },
];

const BOTTOM_ITEMS: NavItem[] = [
  {
    label: "Configurações",
    href: "/settings",
    icon: <Settings size={20} />,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  const toggleMenu = (label: string) => {
    setOpenMenus(prev => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <aside className={cn(
      "hidden lg:flex flex-col border-r border-border bg-background/40 backdrop-blur-xl shrink-0 z-40 transition-all duration-300 relative",
      isCollapsed ? "w-18" : "w-65"
    )}>
      {/* Logo */}
      <div className={cn("flex items-center h-16 border-b border-sidebar-border relative transition-all duration-300", isCollapsed ? "justify-center px-0" : "px-5")}>
        <div className={cn("flex items-center gap-2.5 overflow-hidden transition-all duration-300", isCollapsed ? "opacity-0 w-0" : "opacity-100")}>
          <Image src="/icon.png" alt="Crivo Icon" width={40} height={40} className="shrink-0" />
          <div className="shrink-0">
            <div className="leading-none">
              <span className="font-display font-extrabold tracking-widest text-xl">
                <span className="text-[#09090B] dark:text-[#E4E4E7]">CRI</span>
                <span className="text-[#A78BFA]">VO</span>
              </span>
            </div>
            <div className="text-[13px] text-muted-foreground dark:text-zinc-400 -mt-0.5">Painel administrativo</div>
          </div>
        </div>
        
        {isCollapsed && (
          <Image src="/icon.png" alt="Crivo Icon" width={40} height={40} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
        )}

        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-5 bg-background border border-border shadow-sm flex items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground transition-all z-50 h-6 w-6"
        >
          {isCollapsed ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active = item.href ? pathname === item.href : item.subItems?.some(s => pathname === s.href);
          const hasSubItems = !!item.subItems;
          const isOpen = openMenus[item.label];

          const content = (
            <>
              <div className={cn(isCollapsed && !active && "text-muted-foreground group-hover:text-foreground transition-colors")}>
                {item.icon}
              </div>
              {!isCollapsed && <span className="flex-1 whitespace-nowrap overflow-hidden">{item.label}</span>}
              {!isCollapsed && hasSubItems && (
                <div className="shrink-0 text-muted-foreground transition-colors">
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
              )}
            </>
          );

          return (
            <div key={item.label} className="space-y-1">
              {item.href ? (
                <Link
                  href={item.href}
                  title={isCollapsed ? item.label : undefined}
                  className={cn(
                    "relative flex items-center rounded-xl text-sm font-medium transition-all duration-300 group cursor-pointer",
                    isCollapsed ? "justify-center p-3" : "gap-3 px-3 py-3",
                    active
                      ? "bg-primary/15 text-foreground font-semibold shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] after:absolute after:left-0 after:top-1/2 after:-translate-y-1/2 after:h-[80%] after:w-0.75 after:rounded-r-full after:bg-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                >
                  {content}
                </Link>
              ) : (
                <div
                  title={isCollapsed ? item.label : undefined}
                  onClick={() => {
                    if (isCollapsed) setIsCollapsed(false);
                    toggleMenu(item.label);
                  }}
                  className={cn(
                    "relative flex items-center rounded-xl text-sm font-medium transition-all duration-300 group cursor-pointer",
                    isCollapsed ? "justify-center p-3" : "gap-3 px-3 py-3",
                    active
                      ? "bg-primary/15 text-foreground font-semibold shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] after:absolute after:left-0 after:top-1/2 after:-translate-y-1/2 after:h-[80%] after:w-0.75 after:rounded-r-full after:bg-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                    isOpen && !active && "bg-secondary/50"
                  )}
                >
                  {content}
                </div>
              )}

              {/* Subitems */}
              {hasSubItems && isOpen && !isCollapsed && (
                <div className="pl-10 pr-3 py-1 flex flex-col gap-1 overflow-hidden animate-in slide-in-from-top-2">
                  {item.subItems!.map((sub) => {
                    const subActive = pathname === sub.href;
                    return (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        className={cn(
                          "flex items-center text-sm rounded-lg px-3 py-2 transition-colors",
                          subActive 
                            ? "text-primary bg-primary/5 font-medium" 
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                        )}
                      >
                        {sub.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Bottom nav */}
      <div className="px-3 pb-4 space-y-1 border-t border-sidebar-border pt-4">
        {BOTTOM_ITEMS.map((item) => {
          const active = item.href ? pathname === item.href : false;
          return (
            <Link
              key={item.label}
              href={item.href || "#"}
              title={isCollapsed ? item.label : undefined}
              className={cn(
                "relative flex items-center rounded-xl text-sm font-medium transition-all duration-300 group",
                isCollapsed ? "justify-center p-3" : "gap-3 px-3 py-3",
                active
                  ? "bg-primary/15 text-foreground font-semibold shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] after:absolute after:left-0 after:top-1/2 after:-translate-y-1/2 after:h-[80%] after:w-0.75 after:rounded-r-full after:bg-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              <div className={cn(isCollapsed && !active && "text-muted-foreground group-hover:text-foreground transition-colors")}>
                {item.icon}
              </div>
              {!isCollapsed && <span className="flex-1 whitespace-nowrap overflow-hidden">{item.label}</span>}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}

