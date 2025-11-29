"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Sidebar } from "./sidebar";

interface MobileNavProps {
  isAdmin: boolean;
}

export function MobileNav({ isAdmin }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Hamburger button */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => setIsOpen(true)}
      >
        <Menu className="h-6 w-6" />
      </Button>

      {/* Overlay */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
            onClick={() => setIsOpen(false)}
          />

          {/* Sidebar */}
          <div className="fixed inset-y-0 left-0 z-50 lg:hidden">
            <div className="relative h-full">
              <Sidebar isAdmin={isAdmin} onNavigate={() => setIsOpen(false)} />
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-3"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
