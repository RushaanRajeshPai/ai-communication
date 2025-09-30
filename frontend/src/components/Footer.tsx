// src/components/Footer.tsx

import type { FC } from 'react';

// 1. Define an interface for the component's props
interface FooterProps {
  whitelogo: string; // Assuming the logo is a path (string)
  footer: string;    // Assuming the footer image is also a path (string)
}

// 2. Create a typed Functional Component (FC) that accepts these props
const Footer: FC<FooterProps> = ({ whitelogo, footer }) => {
  return (
    <div className="mt-0">
      <footer className="relative  text-white px-4 sm:px-6 lg:px-12 pt-16 pb-12 overflow-hidden" style={{ background: 'linear-gradient(135deg, rgb(27, 31, 46) 0%, rgb(20, 24, 38) 50%, rgb(15, 18, 30) 100%)' }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 max-w-7xl mx-auto relative z-10">
          
          {/* Column 1 - Brand */}
          <div className="hidden sm:block">
            <h2 className="text-2xl font-extrabold">
              <img
                src={whitelogo}
                alt="Brand Logo"
                className="w-full max-w-[400px] max-h-[300px]"
              />
            </h2>
            <p className="text-gray-300 mt-4 text-sm sm:text-base leading-relaxed max-w-xs">
              Empowering the next generation of talent with AI-powered tools and mentorships.
            </p>
          </div>

          {/* Column 2 - Programs */}
          <div>
            <h3 className="font-semibold text-3xl mb-4">Programs</h3>
            <ul className="space-y-3 text-gray-300 text-sm sm:text-base">
              <li>
                <a href="/resume-builder" className="hover:text-white transition-colors no-underline">
                  Resume Builder
                </a>
              </li>
              <li>
                <a href="/resume-analyser" className="hover:text-white transition-colors no-underline">
                  Resume Analyser
                </a>
              </li>
              <li>
                {/* It's better to wrap interactive elements in an <a> or <button> */}
                <a href="/ai-interview-buddy" className="hover:text-white transition-colors no-underline">
                  AI Interview Buddy
                </a>
              </li>
            </ul>
          </div>

          {/* Column 3 - Company */}
          <div>
            <h3 className="font-semibold text-3xl mb-4">Company</h3>
            <ul className="space-y-3 text-gray-300 text-sm sm:text-base">
              {/* For better accessibility, list items that look like links should be links */}
              <li><a href="/about" className="hover:text-white transition-colors no-underline">About Us</a></li>
              <li><a href="/careers" className="hover:text-white transition-colors no-underline">Careers</a></li>
              <li><a href="/contact" className="hover:text-white transition-colors no-underline">Contact</a></li>
              <li><a href="/privacy-policy" className="hover:text-white transition-colors no-underline">Privacy Policy</a></li>
              <li><a href="/terms-of-service" className="hover:text-white transition-colors no-underline">Terms of Service</a></li>
            </ul>
          </div>

          {/* Column 4 - Newsletter */}
          <div>
            <h3 className="font-semibold text-3xl mb-4">Subscribe</h3>
            <p className="text-gray-300 mb-4 text-sm sm:text-base leading-relaxed">
              Get the latest updates on new courses and opportunities.
            </p>
            <form className="flex flex-col space-y-3">
              <input
                type="email"
                placeholder="Your email address"
                className="w-full px-4 py-3 rounded-full bg-transparent border border-gray-500 text-sm sm:text-base focus:outline-none focus:border-white"
                aria-label="Email for newsletter"
              />
              <button
                type="submit"
                className="w-full py-3 rounded-full font-semibold bg-gradient-to-r from-green-400 to-blue-500 hover:opacity-90 transition"
              >
                Subscribe
              </button>
            </form>
          </div>
        </div>

        {/* Divider */}
        <div className="w-full border-t border-gray-700 mt-10"></div>

        {/* Faded background logo */}
        <div className="flex items-center justify-center mt-10 opacity-10">
          <img
            src={footer}
            alt="Background Logo"
            className="w-full max-w-[1400px] max-h-[300px]"
          />
        </div>
      </footer>
    </div>
  );
};

export default Footer;