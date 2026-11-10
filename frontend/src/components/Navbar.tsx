import React, { useState } from 'react';
import { Logo } from './Logo';
import { Menu, X } from 'lucide-react';

interface NavbarProps {
  onLoginClick?: () => void;
  onGetStartedClick?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onLoginClick,
  onGetStartedClick
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="w-full bg-white sticky top-0 z-50 border-b border-slate-100/80">
      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
        <div className="flex items-center justify-between h-20">
          
          {/* Logo (as seen in landingpage.png) */}
          <a href="#" className="flex items-center">
            <Logo size="md" />
          </a>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center space-x-9 text-[15px] font-normal text-slate-700">
            <a href="#product" className="hover:text-black transition-colors">Product</a>
            <a href="#features" className="hover:text-black transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-black transition-colors">How it works</a>
            <a href="#languages" className="hover:text-black transition-colors">Languages</a>
          </nav>

          {/* Right Action Buttons */}
          <div className="hidden md:flex items-center space-x-6">
            <button
              onClick={onLoginClick}
              className="text-[15px] font-normal text-slate-800 hover:text-black transition-colors"
            >
              Log in
            </button>
            <button
              onClick={onGetStartedClick}
              className="bg-black hover:bg-neutral-800 text-white text-[15px] font-medium px-5 py-2.5 rounded-full transition-all duration-200"
            >
              Get started
            </button>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-slate-700 hover:text-black"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-100 bg-white px-6 py-6 space-y-4">
          <nav className="flex flex-col space-y-3 text-base text-slate-800">
            <a href="#product" onClick={() => setMobileMenuOpen(false)}>Product</a>
            <a href="#features" onClick={() => setMobileMenuOpen(false)}>Features</a>
            <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)}>How it works</a>
            <a href="#languages" onClick={() => setMobileMenuOpen(false)}>Languages</a>
          </nav>
          <div className="pt-4 border-t border-slate-100 flex flex-col gap-3">
            <button
              onClick={() => { onLoginClick?.(); setMobileMenuOpen(false); }}
              className="w-full text-center py-2.5 rounded-full border border-slate-200 font-medium text-slate-800"
            >
              Log in
            </button>
            <button
              onClick={() => { onGetStartedClick?.(); setMobileMenuOpen(false); }}
              className="w-full text-center py-2.5 rounded-full bg-black text-white font-medium"
            >
              Get started
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
