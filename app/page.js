'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    Menu, X, LogIn, Radio, Shield, Droplets, MapPin, Wifi, Lock,
    Package, BarChart3, Bell, Check, Sparkles, Star, Quote, ChevronDown
} from 'lucide-react';

/* ─────────────────────────────────────────────
   ALL CSS scoped under .lp-root — zero bleed
   into dashboard / login / other pages.
───────────────────────────────────────────── */
const LP_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap');

.lp-root, .lp-root *, .lp-root *::before, .lp-root *::after {
  box-sizing: border-box; margin: 0; padding: 0;
}
.lp-root {
  --lp-bg:          #f0f4f8;
  --lp-bg2:         #ffffff;
  --lp-fg:          #0f172a;
  --lp-fg2:         #334155;
  --lp-muted:       #64748b;
  --lp-border:      #e2e8f0;
  --lp-primary:     #2563eb;
  --lp-primary-dk:  #1d4ed8;
  --lp-primary-lt:  #dbeafe;
  --lp-card:        #ffffff;
  --lp-section-alt: #f8fafc;
  --lp-hero-bg:     linear-gradient(135deg, #e8f1fb 0%, #f0f7ff 40%, #e6f0fa 100%);
  --lp-radius:      0.75rem;
  --lp-radius-lg:   1rem;
  --lp-trans:       0.18s cubic-bezier(0.2,0,0,1);
  --lp-shadow:      0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
  --lp-shadow-md:   0 4px 16px rgba(0,0,0,0.08);
  --lp-shadow-lg:   0 8px 32px rgba(37,99,235,0.12);
  --lp-font:        'Inter', sans-serif;
  --lp-mono:        'JetBrains Mono', monospace;

  font-family: var(--lp-font);
  background: var(--lp-bg2);
  color: var(--lp-fg);
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
  scroll-behavior: smooth;
}

.lp-root .lp-container {
  width: 100%; max-width: 1200px;
  margin: 0 auto; padding: 0 1.5rem;
}
.lp-root .lp-section { padding: 5rem 0; }

/* Navbar */
.lp-root .lp-nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 100;
  backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--lp-border);
  transition: background var(--lp-trans);
}
.lp-root .lp-nav-inner {
  display: flex; align-items: center; justify-content: space-between; height: 64px;
}
.lp-root .lp-logo {
  font-size: 1.25rem; font-weight: 800; letter-spacing: -0.02em;
  color: var(--lp-fg); text-decoration: none;
}
.lp-root .lp-logo span { color: var(--lp-primary); }
.lp-root .lp-nav-links { display: flex; align-items: center; gap: 2rem; }
.lp-root .lp-nav-link {
  font-size: 0.9rem; font-weight: 500;
  color: var(--lp-fg2); text-decoration: none;
  transition: color var(--lp-trans);
}
.lp-root .lp-nav-link:hover { color: var(--lp-fg); }
.lp-root .lp-burger {
  background: none; border: none; color: var(--lp-fg);
  cursor: pointer; padding: 4px; display: none;
}
.lp-root .lp-mobile-menu {
  background: rgba(255,255,255,0.97);
  border-bottom: 1px solid var(--lp-border);
  padding: 0.5rem 1.5rem 1.25rem;
}
.lp-root .lp-mobile-link {
  display: block; padding: 0.75rem 0;
  color: var(--lp-fg2); text-decoration: none;
  font-size: 0.95rem; font-weight: 500;
  border-bottom: 1px solid var(--lp-border);
}

/* Buttons */
.lp-root .lp-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 0.45rem;
  padding: 0.65rem 1.35rem;
  background: var(--lp-primary); color: #fff;
  border: none; border-radius: var(--lp-radius);
  font-family: var(--lp-font); font-size: 0.875rem; font-weight: 600;
  cursor: pointer; text-decoration: none;
  transition: background var(--lp-trans), transform var(--lp-trans), box-shadow var(--lp-trans);
  box-shadow: 0 2px 8px rgba(37,99,235,0.25);
}
.lp-root .lp-btn:hover { background: var(--lp-primary-dk); transform: translateY(-1px); box-shadow: 0 4px 14px rgba(37,99,235,0.3); }
.lp-root .lp-btn:active { transform: scale(0.98); }
.lp-root .lp-btn-outline {
  display: inline-flex; align-items: center; justify-content: center; gap: 0.45rem;
  padding: 0.65rem 1.35rem;
  background: transparent; color: var(--lp-fg);
  border: 1.5px solid var(--lp-border); border-radius: var(--lp-radius);
  font-family: var(--lp-font); font-size: 0.875rem; font-weight: 600;
  cursor: pointer; text-decoration: none;
  transition: border-color var(--lp-trans), background var(--lp-trans);
}
.lp-root .lp-btn-outline:hover { border-color: #94a3b8; background: var(--lp-section-alt); }
.lp-root .lp-btn-lg { padding: 0.8rem 1.75rem; font-size: 0.95rem; }
.lp-root .lp-btn-full { width: 100%; }

/* Hero */
.lp-root .lp-hero {
  background: var(--lp-hero-bg);
  padding: 9rem 0 5rem; position: relative; overflow: hidden;
}
.lp-root .lp-hero-grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 4rem; align-items: center;
}
.lp-root .lp-hero-badge {
  display: inline-flex; align-items: center; gap: 0.5rem;
  padding: 0.35rem 0.875rem; border-radius: 999px;
  background: rgba(37,99,235,0.08); border: 1px solid rgba(37,99,235,0.18);
  color: var(--lp-primary); font-size: 0.75rem; font-weight: 600;
  font-family: var(--lp-mono); margin-bottom: 1.5rem;
}
.lp-root .lp-badge-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: #f59e0b; animation: lp-pulse 2s infinite;
  display: inline-block;
}
.lp-root .lp-hero h1 {
  font-size: clamp(2.5rem, 5vw, 3.75rem); font-weight: 800;
  line-height: 1.08; letter-spacing: -0.03em;
  color: var(--lp-fg); margin-bottom: 1.5rem;
}
.lp-root .lp-hero h1 span { color: var(--lp-primary); }
.lp-root .lp-hero p {
  font-size: 1.05rem; color: var(--lp-muted);
  line-height: 1.75; max-width: 440px; margin-bottom: 2.5rem;
}
.lp-root .lp-hero-btns { display: flex; flex-wrap: wrap; gap: 0.875rem; }
.lp-root .lp-hero-img { display: flex; justify-content: center; align-items: center; }
.lp-root .lp-device-card {
  width: 100%; max-width: 400px;
  background: rgba(255,255,255,0.75);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.95);
  border-radius: 1.5rem;
  box-shadow: 0 20px 60px rgba(37,99,235,0.12), 0 4px 16px rgba(0,0,0,0.06);
  padding: 1.75rem;
  animation: lp-float 5s ease-in-out infinite;
}
.lp-root .lp-device-header { display: flex; align-items: center; gap: 0.875rem; margin-bottom: 1.5rem; }
.lp-root .lp-device-icon {
  width: 48px; height: 48px; border-radius: 12px;
  background: var(--lp-primary); display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 12px rgba(37,99,235,0.3); flex-shrink: 0;
}
.lp-root .lp-device-name { font-weight: 700; font-size: 1rem; color: var(--lp-fg); }
.lp-root .lp-device-status {
  display: flex; align-items: center; gap: 0.35rem;
  font-family: var(--lp-mono); font-size: 0.75rem; color: var(--lp-primary); margin-top: 2px;
}
.lp-root .lp-status-dot {
  width: 6px; height: 6px; border-radius: 50%; background: #22c55e;
  animation: lp-pulse 2s infinite; display: inline-block;
}
.lp-root .lp-device-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.6rem 0; border-bottom: 1px solid var(--lp-border); font-size: 0.82rem;
}
.lp-root .lp-device-row:last-child { border-bottom: none; }
.lp-root .lp-row-label { color: var(--lp-muted); }
.lp-root .lp-row-val { font-family: var(--lp-mono); font-weight: 600; color: var(--lp-fg); font-size: 0.8rem; }

/* Section headings */
.lp-root .lp-eyebrow {
  font-size: 0.72rem; font-weight: 700; letter-spacing: 0.15em;
  text-transform: uppercase; color: var(--lp-primary);
  display: block; margin-bottom: 0.75rem;
}
.lp-root .lp-section-title {
  font-size: clamp(1.75rem, 3vw, 2.25rem); font-weight: 800;
  letter-spacing: -0.025em; color: var(--lp-fg); margin-bottom: 1rem;
}
.lp-root .lp-section-sub {
  color: var(--lp-muted); max-width: 520px;
  margin: 0 auto; line-height: 1.7; font-size: 1rem;
}
.lp-root .lp-section-head { text-align: center; margin-bottom: 4rem; }

/* Stats */
.lp-root .lp-stats-wrap {
  background: var(--lp-card); border: 1px solid var(--lp-border);
  border-radius: 1.5rem; padding: 3rem; box-shadow: var(--lp-shadow-md);
}
.lp-root .lp-stats-grid {
  display: grid; grid-template-columns: repeat(4,1fr); gap: 2rem;
}
.lp-root .lp-stat { text-align: center; }
.lp-root .lp-stat-val {
  font-family: var(--lp-mono); font-weight: 700;
  font-size: clamp(2rem, 3.5vw, 2.75rem); margin-bottom: 0.4rem;
}
.lp-root .lp-stat-val.blue  { color: var(--lp-primary); }
.lp-root .lp-stat-val.green { color: #059669; }
.lp-root .lp-stat-label {
  font-size: 0.7rem; font-weight: 600; letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--lp-muted);
}

/* How it works */
.lp-root .lp-steps-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 3rem; align-items: center;
}
.lp-root .lp-steps-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.lp-root .lp-step-card {
  background: var(--lp-card); border: 1px solid var(--lp-border);
  border-radius: var(--lp-radius-lg); padding: 1.25rem; box-shadow: var(--lp-shadow);
  transition: box-shadow var(--lp-trans), transform var(--lp-trans);
}
.lp-root .lp-step-card:hover { box-shadow: var(--lp-shadow-md); transform: translateY(-2px); }
.lp-root .lp-step-icon-wrap { position: relative; display: inline-flex; margin-bottom: 1rem; }
.lp-root .lp-step-icon {
  width: 48px; height: 48px; border-radius: 12px;
  background: var(--lp-primary); display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 12px rgba(37,99,235,0.25);
}
.lp-root .lp-step-num {
  position: absolute; top: -6px; right: -6px;
  width: 22px; height: 22px; border-radius: 50%;
  background: #f59e0b; color: #fff;
  font-size: 0.6rem; font-weight: 800;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 6px rgba(245,158,11,0.4);
}
.lp-root .lp-step-title { font-weight: 700; font-size: 0.9rem; color: var(--lp-fg); margin-bottom: 0.4rem; }
.lp-root .lp-step-desc  { font-size: 0.77rem; color: var(--lp-muted); line-height: 1.55; }
.lp-root .lp-dash-preview {
  background: var(--lp-card); border: 1px solid var(--lp-border);
  border-radius: 1.25rem; overflow: hidden;
  box-shadow: 0 16px 48px rgba(0,0,0,0.08);
}
.lp-root .lp-dash-bar {
  background: var(--lp-section-alt); border-bottom: 1px solid var(--lp-border);
  padding: 0.65rem 1rem; display: flex; align-items: center; gap: 0.4rem;
}
.lp-root .lp-dot-r { width:10px;height:10px;border-radius:50%;background:#ff5f57; }
.lp-root .lp-dot-y { width:10px;height:10px;border-radius:50%;background:#febc2e; }
.lp-root .lp-dot-g { width:10px;height:10px;border-radius:50%;background:#28c840; }
.lp-root .lp-dash-url { flex:1; background:var(--lp-border); border-radius:6px; height:18px; margin-left:0.5rem; }
.lp-root .lp-dash-map {
  height: 160px; position: relative; overflow: hidden;
  background: linear-gradient(135deg, #e0eeff 0%, #e8f5e9 100%);
}
.lp-root .lp-map-grid {
  position: absolute; inset: 0;
  background-image: linear-gradient(rgba(37,99,235,0.06) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(37,99,235,0.06) 1px, transparent 1px);
  background-size: 28px 28px;
}
.lp-root .lp-map-dot { position: absolute; border-radius: 50%; }
.lp-root .lp-dash-stats { padding: 1rem; display: grid; grid-template-columns: repeat(3,1fr); gap: 0.75rem; }
.lp-root .lp-dash-stat { text-align: center; background: var(--lp-section-alt); border-radius: 10px; padding: 0.6rem; }
.lp-root .lp-dash-stat-v { font-family: var(--lp-mono); color: var(--lp-primary); font-weight: 700; font-size: 1rem; }
.lp-root .lp-dash-stat-l { color: var(--lp-muted); font-size: 0.65rem; margin-top: 2px; }

/* Features */
.lp-root .lp-features-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 1.25rem; }
.lp-root .lp-feat-card {
  background: var(--lp-card); border: 1px solid var(--lp-border);
  border-radius: var(--lp-radius-lg); padding: 1.5rem; box-shadow: var(--lp-shadow);
  transition: box-shadow var(--lp-trans), transform var(--lp-trans);
}
.lp-root .lp-feat-card:hover { box-shadow: var(--lp-shadow-lg); transform: translateY(-3px); }
.lp-root .lp-feat-icon {
  width: 48px; height: 48px; border-radius: 12px;
  background: var(--lp-primary); display: flex; align-items: center; justify-content: center;
  margin-bottom: 1rem; box-shadow: 0 4px 12px rgba(37,99,235,0.2);
}
.lp-root .lp-feat-title { font-weight: 700; font-size: 1rem; color: var(--lp-fg); margin-bottom: 0.5rem; }
.lp-root .lp-feat-desc  { font-size: 0.875rem; color: var(--lp-muted); line-height: 1.6; }

/* Testimonials */
.lp-root .lp-test-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3rem; align-items: center; }
.lp-root .lp-test-card {
  background: var(--lp-card); border: 1px solid var(--lp-border);
  border-radius: var(--lp-radius-lg); padding: 1.25rem; box-shadow: var(--lp-shadow);
  position: relative; margin-bottom: 1rem;
}
.lp-root .lp-test-card:last-child { margin-bottom: 0; }
.lp-root .lp-stars { display: flex; gap: 3px; margin-bottom: 0.75rem; }
.lp-root .lp-quote-text { font-size: 0.875rem; color: var(--lp-fg2); line-height: 1.65; margin-bottom: 1rem; }
.lp-root .lp-test-author { display: flex; align-items: center; gap: 0.75rem; }
.lp-root .lp-avatar {
  width: 36px; height: 36px; border-radius: 50%;
  background: var(--lp-primary); color: #fff;
  font-size: 0.7rem; font-weight: 700;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.lp-root .lp-author-name { font-weight: 700; font-size: 0.875rem; color: var(--lp-fg); }
.lp-root .lp-author-role { font-size: 0.75rem; color: var(--lp-muted); }
.lp-root .lp-quote-icon { position: absolute; top: 12px; right: 16px; }
.lp-root .lp-fleet-vis {
  display: grid; grid-template-columns: repeat(3,1fr); gap: 0.75rem;
  background: var(--lp-section-alt); border: 1px solid var(--lp-border);
  border-radius: 1.25rem; padding: 1.5rem; box-shadow: var(--lp-shadow-md);
}
.lp-root .lp-fleet-tile {
  height: 72px; border-radius: 10px; border: 1px solid var(--lp-border);
  background: var(--lp-card); display: flex; align-items: center; justify-content: center;
  box-shadow: var(--lp-shadow);
}

/* Pricing */
.lp-root .lp-pricing-grid {
  display: grid; grid-template-columns: repeat(3,1fr);
  gap: 1.25rem; max-width: 960px; margin: 0 auto;
}
.lp-root .lp-plan {
  background: var(--lp-card); border: 1px solid var(--lp-border);
  border-radius: 1.25rem; padding: 1.75rem; box-shadow: var(--lp-shadow);
  transition: box-shadow var(--lp-trans);
}
.lp-root .lp-plan:hover { box-shadow: var(--lp-shadow-md); }
.lp-root .lp-plan-hot {
  background: var(--lp-primary); border-color: var(--lp-primary);
  box-shadow: 0 8px 32px rgba(37,99,235,0.3);
}
.lp-root .lp-popular-badge {
  display: flex; align-items: center; gap: 0.4rem;
  font-size: 0.7rem; font-weight: 700; letter-spacing: 0.1em;
  text-transform: uppercase; color: rgba(255,255,255,0.85); margin-bottom: 1rem;
}
.lp-root .lp-plan-name { font-weight: 800; font-size: 1.25rem; margin-bottom: 0.25rem; }
.lp-root .lp-plan-name-hot { color: #fff; }
.lp-root .lp-plan-name-reg { color: var(--lp-fg); }
.lp-root .lp-plan-desc { font-size: 0.82rem; margin-bottom: 1.25rem; }
.lp-root .lp-plan-desc-hot { color: rgba(255,255,255,0.75); }
.lp-root .lp-plan-desc-reg { color: var(--lp-muted); }
.lp-root .lp-plan-price { display: flex; align-items: baseline; gap: 0.25rem; margin-bottom: 1.5rem; }
.lp-root .lp-price-num { font-family: var(--lp-mono); font-weight: 800; font-size: 2.5rem; letter-spacing: -0.04em; }
.lp-root .lp-price-num-hot { color: #fff; }
.lp-root .lp-price-num-reg { color: var(--lp-fg); }
.lp-root .lp-price-period { font-size: 0.8rem; }
.lp-root .lp-price-period-hot { color: rgba(255,255,255,0.65); }
.lp-root .lp-price-period-reg { color: var(--lp-muted); }
.lp-root .lp-plan-btn-hot {
  display: block; text-align: center; padding: 0.75rem; border-radius: var(--lp-radius);
  background: #fff; color: var(--lp-primary); font-weight: 700; font-size: 0.9rem;
  text-decoration: none; margin-bottom: 1.5rem;
  transition: background var(--lp-trans);
}
.lp-root .lp-plan-btn-hot:hover { background: #f0f7ff; }
.lp-root .lp-plan-features { display: flex; flex-direction: column; gap: 0.7rem; list-style: none; }
.lp-root .lp-feat-item { display: flex; align-items: flex-start; gap: 0.6rem; font-size: 0.875rem; }
.lp-root .lp-feat-item-hot { color: rgba(255,255,255,0.9); }
.lp-root .lp-feat-item-reg { color: var(--lp-fg2); }
.lp-root .lp-check-hot { color: #fff; flex-shrink: 0; margin-top: 2px; }
.lp-root .lp-check-reg { color: var(--lp-primary); flex-shrink: 0; margin-top: 2px; }

/* FAQ */
.lp-root .lp-faq-list { display: flex; flex-direction: column; gap: 0.75rem; }
.lp-root .lp-faq-item {
  background: var(--lp-card); border: 1px solid var(--lp-border);
  border-radius: var(--lp-radius-lg); overflow: hidden; box-shadow: var(--lp-shadow);
}
.lp-root .lp-faq-q {
  width: 100%; display: flex; align-items: center; justify-content: space-between;
  padding: 1.1rem 1.35rem; background: none; border: none;
  color: var(--lp-fg); font-family: var(--lp-font); font-size: 0.9rem; font-weight: 600;
  cursor: pointer; text-align: left;
}
.lp-root .lp-faq-chevron { flex-shrink: 0; color: var(--lp-primary); transition: transform 0.3s ease; }
.lp-root .lp-faq-chevron.open { transform: rotate(180deg); }
.lp-root .lp-faq-body { max-height: 0; overflow: hidden; opacity: 0; transition: max-height 0.35s cubic-bezier(0.2,0,0,1), opacity 0.3s ease; }
.lp-root .lp-faq-body.open { max-height: 400px; opacity: 1; }
.lp-root .lp-faq-body p { padding: 0 1.35rem 1.1rem; font-size: 0.875rem; color: var(--lp-muted); line-height: 1.7; }

/* Contact */
.lp-root .lp-contact-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4rem; max-width: 900px; margin: 0 auto; align-items: start; }
.lp-root .lp-status-box {
  background: var(--lp-card); border: 1px solid var(--lp-border);
  border-radius: var(--lp-radius-lg); padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: var(--lp-shadow);
}
.lp-root .lp-status-title { font-weight: 700; font-size: 0.875rem; color: var(--lp-fg); margin-bottom: 1rem; }
.lp-root .lp-status-row { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; }
.lp-root .lp-status-row:last-child { margin-bottom: 0; }
.lp-root .lp-s-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.lp-root .lp-s-text { font-family: var(--lp-mono); font-size: 0.78rem; color: var(--lp-muted); }
.lp-root .lp-success-banner {
  background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: var(--lp-radius);
  padding: 0.875rem 1rem; margin-bottom: 1rem;
  color: #16a34a; font-size: 0.875rem; font-weight: 500;
}
.lp-root .lp-form { display: flex; flex-direction: column; gap: 0.875rem; }
.lp-root .lp-input {
  width: 100%; background: var(--lp-bg2);
  border: 1.5px solid var(--lp-border); border-radius: var(--lp-radius);
  padding: 0.8rem 1rem; font-size: 0.875rem;
  font-family: var(--lp-font); color: var(--lp-fg); outline: none;
  transition: border-color var(--lp-trans), box-shadow var(--lp-trans);
}
.lp-root .lp-input::placeholder { color: var(--lp-muted); }
.lp-root .lp-input:focus { border-color: var(--lp-primary); box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
.lp-root .lp-textarea { resize: none; }

/* Footer */
.lp-root .lp-footer { border-top: 1px solid var(--lp-border); padding: 2.5rem 0; background: var(--lp-bg2); }
.lp-root .lp-footer-inner { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; }
.lp-root .lp-footer-links { display: flex; gap: 1.5rem; }
.lp-root .lp-footer-link { font-size: 0.8rem; color: var(--lp-muted); text-decoration: none; transition: color var(--lp-trans); }
.lp-root .lp-footer-link:hover { color: var(--lp-fg); }
.lp-root .lp-footer-copy { font-size: 0.75rem; color: var(--lp-muted); }

/* Scroll reveal */
.lp-root .lp-reveal { opacity: 0; transform: translateY(22px); transition: opacity 0.6s cubic-bezier(0.2,0,0,1), transform 0.6s cubic-bezier(0.2,0,0,1); }
.lp-root .lp-reveal.lp-visible { opacity: 1; transform: none; }

/* Animations */
@keyframes lp-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
@keyframes lp-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
@keyframes lp-fadeup { from { opacity: 0; transform: translateY(26px); } to { opacity: 1; transform: none; } }
.lp-root .lp-fade-up    { animation: lp-fadeup 0.6s cubic-bezier(0.2,0,0,1) both; }
.lp-root .lp-fade-up-d1 { animation: lp-fadeup 0.6s 0.15s cubic-bezier(0.2,0,0,1) both; }

/* Responsive */
@media (max-width: 900px) {
  .lp-root .lp-hero-grid,
  .lp-root .lp-steps-grid,
  .lp-root .lp-test-grid,
  .lp-root .lp-contact-grid { grid-template-columns: 1fr; }
  .lp-root .lp-features-grid { grid-template-columns: repeat(2,1fr); }
  .lp-root .lp-pricing-grid  { grid-template-columns: 1fr; max-width: 440px; }
  .lp-root .lp-stats-grid    { grid-template-columns: repeat(2,1fr); }
  .lp-root .lp-nav-links { display: none; }
  .lp-root .lp-burger { display: flex !important; }
  .lp-root .lp-section { padding: 3.5rem 0; }
  .lp-root .lp-hero { padding: 7.5rem 0 3.5rem; }
}
@media (max-width: 600px) {
  .lp-root .lp-features-grid { grid-template-columns: 1fr; }
  .lp-root .lp-steps-cards   { grid-template-columns: 1fr; }
}
`;

/* ── Scroll reveal ── */
function useReveal() {
    useEffect(() => {
        const obs = new IntersectionObserver(
            entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('lp-visible'); }),
            { threshold: 0.1 }
        );
        document.querySelectorAll('.lp-reveal').forEach(el => obs.observe(el));
        return () => obs.disconnect();
    }, []);
}

/* ════════════════════════════════════════════ NAVBAR */
const NAV_LINKS = [
    { label: 'Features', href: '#features' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'Specifications', href: '#stats' },
    { label: 'Contact', href: '#contact' },
];

function Navbar() {
    const [open, setOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    useEffect(() => {
        const fn = () => setScrolled(window.scrollY > 16);
        window.addEventListener('scroll', fn);
        return () => window.removeEventListener('scroll', fn);
    }, []);
    return (
        <nav className="lp-nav" style={{ background: scrolled ? 'rgba(255,255,255,0.97)' : 'rgba(255,255,255,0.80)' }}>
            <div className="lp-container lp-nav-inner">
                <a href="#" className="lp-logo">Track<span>Pro</span></a>
                <div className="lp-nav-links">
                    {NAV_LINKS.map(l => <a key={l.label} href={l.href} className="lp-nav-link">{l.label}</a>)}
                    <Link href="/login" className="lp-btn" style={{ padding: '0.55rem 1.1rem' }}>
                        <LogIn size={15} /> Sign In
                    </Link>
                </div>
                <button className="lp-burger" onClick={() => setOpen(!open)}>
                    {open ? <X size={22} /> : <Menu size={22} />}
                </button>
            </div>
            {open && (
                <div className="lp-mobile-menu">
                    {NAV_LINKS.map(l => (
                        <a key={l.label} href={l.href} className="lp-mobile-link" onClick={() => setOpen(false)}>{l.label}</a>
                    ))}
                    <Link href="/login" className="lp-btn lp-btn-full" style={{ marginTop: '1rem', justifyContent: 'center' }} onClick={() => setOpen(false)}>
                        <LogIn size={15} /> Sign In
                    </Link>
                </div>
            )}
        </nav>
    );
}

/* ════════════════════════════════════════════ HERO */
function HeroSection() {
    return (
        <section className="lp-hero">
            <div className="lp-container">
                <div className="lp-hero-grid">
                    <div className="lp-fade-up">
                        <div className="lp-hero-badge">
                            <span className="lp-badge-dot" /> Signal: Nominal
                        </div>
                        <h1>Track everything.<br /><span>Lose nothing.</span></h1>
                        <p>Precision GPS tracking for mission-critical assets. Industrial-grade hardware with sub-15-second latency and 99.99% uptime.</p>
                        <div className="lp-hero-btns">
                            <a href="#contact" className="lp-btn lp-btn-lg">Deploy Now</a>
                            <a href="#features" className="lp-btn-outline lp-btn-lg">View Specifications</a>
                        </div>
                    </div>
                    <div className="lp-hero-img lp-fade-up-d1">
                        <div className="lp-device-card">
                            <div className="lp-device-header">
                                <div className="lp-device-icon"><MapPin size={22} color="#fff" strokeWidth={2.5} /></div>
                                <div>
                                    <div className="lp-device-name">TrackPro Device</div>
                                    <div className="lp-device-status"><span className="lp-status-dot" /> LIVE · 12ms latency</div>
                                </div>
                            </div>
                            {[['Latitude', '28.6139° N'], ['Longitude', '77.2090° E'], ['Speed', '62 km/h'], ['Battery', '87%'], ['Signal', 'LTE · 4G']].map(([label, val]) => (
                                <div className="lp-device-row" key={label}>
                                    <span className="lp-row-label">{label}</span>
                                    <span className="lp-row-val">{val}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

/* ════════════════════════════════════════════ STATS */
const STATS = [
    { val: '99.99%', label: 'UPTIME', cls: 'blue' },
    { val: '< 15s', label: 'LATENCY', cls: 'green' },
    { val: '48h', label: 'BACKUP BATTERY', cls: 'blue' },
    { val: '142', label: 'COUNTRIES', cls: 'green' },
];

function StatsSection() {
    return (
        <section id="stats" className="lp-section" style={{ background: '#f8fafc' }}>
            <div className="lp-container">
                <div className="lp-stats-wrap lp-reveal">
                    <div className="lp-stats-grid">
                        {STATS.map(s => (
                            <div className="lp-stat" key={s.label}>
                                <div className={`lp-stat-val ${s.cls}`}>{s.val}</div>
                                <div className="lp-stat-label">{s.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}

/* ════════════════════════════════════════════ HOW IT WORKS */
const STEPS = [
    { Icon: Package, num: '01', title: 'Unbox & Attach', desc: 'Mount the TrackPro device to any asset in seconds. No wiring or professional installation required.' },
    { Icon: Wifi, num: '02', title: 'Auto-Connect', desc: 'TrackPro automatically connects to the strongest available network — LTE, 3G, or satellite.' },
    { Icon: BarChart3, num: '03', title: 'Track in Real-Time', desc: 'Open your dashboard to see live location, speed, route history, and device health metrics.' },
    { Icon: Bell, num: '04', title: 'Get Alerts', desc: 'Receive instant notifications for geofence breaches, tampering, low battery, and more.' },
];

function HowItWorksSection() {
    return (
        <section className="lp-section">
            <div className="lp-container">
                <div className="lp-section-head lp-reveal">
                    <span className="lp-eyebrow">How It Works</span>
                    <h2 className="lp-section-title">Up and running in minutes</h2>
                    <p className="lp-section-sub">No complex setup. No technician visits. Just attach, connect, and track.</p>
                </div>
                <div className="lp-steps-grid">
                    <div className="lp-steps-cards">
                        {STEPS.map(({ Icon, num, title, desc }) => (
                            <div className="lp-step-card lp-reveal" key={title}>
                                <div className="lp-step-icon-wrap">
                                    <div className="lp-step-icon"><Icon size={22} color="#fff" strokeWidth={2} /></div>
                                    <span className="lp-step-num">{num}</span>
                                </div>
                                <div className="lp-step-title">{title}</div>
                                <div className="lp-step-desc">{desc}</div>
                            </div>
                        ))}
                    </div>
                    <div className="lp-dash-preview lp-reveal">
                        <div className="lp-dash-bar">
                            <div className="lp-dot-r" /><div className="lp-dot-y" /><div className="lp-dot-g" />
                            <div className="lp-dash-url" />
                        </div>
                        <div className="lp-dash-map">
                            <div className="lp-map-grid" />
                            <div className="lp-map-dot" style={{ top: '38%', left: '33%', width: 14, height: 14, background: '#22c55e', boxShadow: '0 0 0 5px rgba(34,197,94,0.2)' }} />
                            <div className="lp-map-dot" style={{ top: '22%', left: '60%', width: 11, height: 11, background: '#2563eb', boxShadow: '0 0 0 4px rgba(37,99,235,0.2)' }} />
                            <div className="lp-map-dot" style={{ top: '64%', left: '18%', width: 11, height: 11, background: '#2563eb' }} />
                        </div>
                        <div className="lp-dash-stats">
                            {[['12', 'Vehicles'], ['3', 'Alerts'], ['99.9%', 'Uptime']].map(([v, l]) => (
                                <div className="lp-dash-stat" key={l}>
                                    <div className="lp-dash-stat-v">{v}</div>
                                    <div className="lp-dash-stat-l">{l}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

/* ════════════════════════════════════════════ FEATURES */
const FEATURES = [
    { Icon: Radio, title: 'Live Telemetry', desc: '1-second refresh rates with real-time data streaming to your dashboard. Never miss a movement.' },
    { Icon: MapPin, title: 'Geofencing', desc: 'Instant SMS and email alerts on perimeter breach. Define unlimited custom zones.' },
    { Icon: Lock, title: 'AES-256 Encryption', desc: 'End-to-end hardware-level security. Your location data never touches an unencrypted channel.' },
    { Icon: Droplets, title: 'IP67 Rated', desc: 'Submersible to 1 meter for 30 minutes. Fully dust-proof. Built for the field.' },
    { Icon: Wifi, title: 'Multi-Network', desc: 'Automatic failover between LTE, 3G, and satellite. Stays connected where others drop.' },
    { Icon: Shield, title: 'Tamper Detection', desc: 'Accelerometer-based alerts for unauthorized removal or device interference.' },
];

function FeaturesSection() {
    return (
        <section id="features" className="lp-section" style={{ background: '#f8fafc' }}>
            <div className="lp-container">
                <div className="lp-section-head lp-reveal">
                    <span className="lp-eyebrow">Capabilities</span>
                    <h2 className="lp-section-title">Built for the field</h2>
                    <p className="lp-section-sub">Every component is engineered for reliability in demanding environments.</p>
                </div>
                <div className="lp-features-grid">
                    {FEATURES.map(({ Icon, title, desc }) => (
                        <div className="lp-feat-card lp-reveal" key={title}>
                            <div className="lp-feat-icon"><Icon size={22} color="#fff" strokeWidth={2} /></div>
                            <div className="lp-feat-title">{title}</div>
                            <p className="lp-feat-desc">{desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

/* ════════════════════════════════════════════ TESTIMONIALS */
const TESTIMONIALS = [
    { name: 'Marcus Chen', role: 'Fleet Director, Pacific Logistics', quote: 'TrackPro cut our asset recovery time by 73%. The real-time alerts alone saved us over $200K last quarter.', rating: 5, av: 'MC' },
    { name: 'Sarah Lindström', role: 'Operations Lead, Nordic Transport', quote: 'We tested five trackers in Arctic conditions. TrackPro was the only one that never dropped signal.', rating: 5, av: 'SL' },
    { name: 'James Okafor', role: 'CEO, SafeHaul Inc.', quote: 'The geofencing and tamper detection are game-changers. Cargo theft dropped to zero within two months.', rating: 5, av: 'JO' },
];

function TestimonialsSection() {
    return (
        <section className="lp-section">
            <div className="lp-container">
                <div className="lp-test-grid">
                    <div className="lp-reveal">
                        <div className="lp-fleet-vis">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div className="lp-fleet-tile" key={i}>
                                    <div style={{ width: 32, height: 18, background: `rgba(37,99,235,${0.15 + i * 0.07})`, borderRadius: 4 }} />
                                </div>
                            ))}
                        </div>
                        <div style={{ textAlign: 'center', marginTop: '0.75rem', fontSize: '0.72rem', color: 'var(--lp-muted)', fontFamily: 'var(--lp-mono)' }}>
                            Fleet tracking · Real-time
                        </div>
                    </div>
                    <div>
                        <div className="lp-reveal" style={{ marginBottom: '2rem' }}>
                            <span className="lp-eyebrow">Testimonials</span>
                            <h2 className="lp-section-title">Trusted by industry leaders</h2>
                        </div>
                        {TESTIMONIALS.map(t => (
                            <div className="lp-test-card lp-reveal" key={t.name}>
                                <Quote size={22} className="lp-quote-icon" style={{ color: 'rgba(37,99,235,0.12)' }} />
                                <div className="lp-stars">
                                    {Array.from({ length: t.rating }).map((_, j) => <Star key={j} size={13} style={{ color: '#f59e0b', fill: '#f59e0b' }} />)}
                                </div>
                                <p className="lp-quote-text">"{t.quote}"</p>
                                <div className="lp-test-author">
                                    <div className="lp-avatar">{t.av}</div>
                                    <div>
                                        <div className="lp-author-name">{t.name}</div>
                                        <div className="lp-author-role">{t.role}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}

/* ════════════════════════════════════════════ PRICING */
const PLANS = [
    { name: 'Starter', price: '$29', period: '/device/mo', desc: 'For individual asset tracking', features: ['1 device', '5-minute refresh rate', 'Basic geofencing', 'Email alerts', '30-day data retention'], hot: false },
    { name: 'Fleet', price: '$19', period: '/device/mo', desc: 'For fleet and logistics operations', features: ['10+ devices', '1-second refresh rate', 'Unlimited geofencing', 'SMS + Email alerts', '1-year data retention', 'API access', 'Priority support'], hot: true },
    { name: 'Enterprise', price: 'Custom', period: '', desc: 'For mission-critical deployments', features: ['Unlimited devices', 'Dedicated infrastructure', 'Custom SLA (99.99%)', 'On-premise option', '24/7 engineering support', 'Custom integrations'], hot: false },
];

function PricingSection() {
    return (
        <section id="pricing" className="lp-section" style={{ background: '#f8fafc' }}>
            <div className="lp-container">
                <div className="lp-section-head lp-reveal">
                    <span className="lp-eyebrow">Pricing</span>
                    <h2 className="lp-section-title">Transparent pricing</h2>
                    <p className="lp-section-sub">Scale from a single asset to an entire fleet. No hidden fees.</p>
                </div>
                <div className="lp-pricing-grid">
                    {PLANS.map(plan => (
                        <div key={plan.name} className={`lp-plan lp-reveal ${plan.hot ? 'lp-plan-hot' : ''}`}>
                            {plan.hot && <div className="lp-popular-badge"><Sparkles size={13} /> MOST POPULAR</div>}
                            <div className={`lp-plan-name ${plan.hot ? 'lp-plan-name-hot' : 'lp-plan-name-reg'}`}>{plan.name}</div>
                            <div className={`lp-plan-desc ${plan.hot ? 'lp-plan-desc-hot' : 'lp-plan-desc-reg'}`}>{plan.desc}</div>
                            <div className="lp-plan-price">
                                <span className={`lp-price-num ${plan.hot ? 'lp-price-num-hot' : 'lp-price-num-reg'}`}>{plan.price}</span>
                                <span className={`lp-price-period ${plan.hot ? 'lp-price-period-hot' : 'lp-price-period-reg'}`}>{plan.period}</span>
                            </div>
                            {plan.hot
                                ? <a href="#contact" className="lp-plan-btn-hot">{plan.price === 'Custom' ? 'Contact Sales' : 'Deploy Now'}</a>
                                : <a href="#contact" className="lp-btn lp-btn-full" style={{ marginBottom: '1.5rem', justifyContent: 'center' }}>{plan.price === 'Custom' ? 'Contact Sales' : 'Deploy Now'}</a>
                            }
                            <ul className="lp-plan-features">
                                {plan.features.map(f => (
                                    <li key={f} className={`lp-feat-item ${plan.hot ? 'lp-feat-item-hot' : 'lp-feat-item-reg'}`}>
                                        <Check size={15} className={plan.hot ? 'lp-check-hot' : 'lp-check-reg'} />{f}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

/* ════════════════════════════════════════════ FAQ */
const FAQS = [
    { q: 'How long does the battery last?', a: "TrackPro's primary battery lasts up to 48 hours on continuous 1-second tracking mode, and up to 30 days in power-saving mode with 15-minute intervals. The device also supports hardwired installation for unlimited power." },
    { q: 'Does TrackPro work internationally?', a: 'Yes. TrackPro operates in 142+ countries with automatic network roaming across LTE, 3G, and satellite connections. No SIM swapping or manual configuration needed.' },
    { q: 'Is there a contract or commitment?', a: 'No long-term contracts required. All plans are month-to-month with no cancellation fees. Enterprise plans can include custom terms for volume discounts.' },
    { q: 'How accurate is the GPS tracking?', a: 'TrackPro uses multi-constellation GNSS (GPS, GLONASS, Galileo) for sub-3-meter accuracy outdoors. Assisted GPS provides positioning even in urban canyons and partially covered environments.' },
    { q: 'Can I integrate TrackPro with my existing systems?', a: 'Absolutely. Our REST API and webhook system integrates with any fleet management, ERP, or logistics platform. We also offer pre-built connectors for SAP, Oracle, and Salesforce.' },
    { q: 'What happens if the device is tampered with?', a: "TrackPro's built-in accelerometer detects unauthorized removal or interference and sends instant alerts via SMS, email, and push notification. The device continues transmitting its location even after tamper detection." },
];

function FAQSection() {
    const [open, setOpen] = useState(null);
    return (
        <section className="lp-section">
            <div className="lp-container" style={{ maxWidth: 760, margin: '0 auto' }}>
                <div className="lp-section-head lp-reveal">
                    <span className="lp-eyebrow">FAQ</span>
                    <h2 className="lp-section-title">Frequently asked questions</h2>
                    <p className="lp-section-sub">Everything you need to know about TrackPro hardware and service.</p>
                </div>
                <div className="lp-faq-list lp-reveal">
                    {FAQS.map((faq, i) => (
                        <div className="lp-faq-item" key={i}>
                            <button className="lp-faq-q" onClick={() => setOpen(open === i ? null : i)}>
                                {faq.q}
                                <ChevronDown size={18} className={`lp-faq-chevron ${open === i ? 'open' : ''}`} />
                            </button>
                            <div className={`lp-faq-body ${open === i ? 'open' : ''}`}>
                                <p>{faq.a}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

/* ════════════════════════════════════════════ CONTACT */
function ContactSection() {
    const [form, setForm] = useState({ name: '', email: '', company: '', message: '' });
    const [sent, setSent] = useState(false);
    const handleSubmit = e => {
        e.preventDefault();
        setSent(true);
        setForm({ name: '', email: '', company: '', message: '' });
        setTimeout(() => setSent(false), 5000);
    };
    return (
        <section id="contact" className="lp-section" style={{ background: '#f8fafc' }}>
            <div className="lp-container">
                <div className="lp-section-head lp-reveal">
                    <span className="lp-eyebrow">Get in touch</span>
                    <h2 className="lp-section-title">Talk to an engineer</h2>
                    <p className="lp-section-sub">Our team will help you scope your deployment, from single-asset tracking to enterprise fleet management.</p>
                </div>
                <div className="lp-contact-grid">
                    <div className="lp-reveal">
                        <div className="lp-status-box">
                            <div className="lp-status-title">System Status</div>
                            {[
                                { color: '#22c55e', pulse: true, text: 'Current Latency: 12ms' },
                                { color: '#2563eb', pulse: false, text: 'All Systems Operational' },
                                { color: '#2563eb', pulse: false, text: 'Response Time: < 24h' },
                            ].map((s, i) => (
                                <div className="lp-status-row" key={i}>
                                    <div className="lp-s-dot" style={{ background: s.color, animation: s.pulse ? 'lp-pulse 2s infinite' : 'none' }} />
                                    <span className="lp-s-text">{s.text}</span>
                                </div>
                            ))}
                        </div>
                        {[['📧 Email', 'support@trackpro.in'], ['📍 Coverage', '142+ countries'], ['⏱ SLA', '99.99% uptime guarantee']].map(([label, val]) => (
                            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--lp-border)', fontSize: '0.82rem' }}>
                                <span style={{ color: 'var(--lp-muted)' }}>{label}</span>
                                <span style={{ color: 'var(--lp-fg)', fontWeight: 500 }}>{val}</span>
                            </div>
                        ))}
                    </div>
                    <div className="lp-reveal">
                        {sent && <div className="lp-success-banner">✓ Message sent! Our engineering team will respond within 24 hours.</div>}
                        <form className="lp-form" onSubmit={handleSubmit}>
                            <input className="lp-input" type="text" placeholder="Name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                            <input className="lp-input" type="email" placeholder="Email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                            <input className="lp-input" type="text" placeholder="Company" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} />
                            <textarea className="lp-input lp-textarea" rows={4} placeholder="Tell us about your deployment needs" required value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} />
                            <button type="submit" className="lp-btn lp-btn-full" style={{ padding: '0.875rem', fontSize: '0.95rem', justifyContent: 'center' }}>Contact Sales</button>
                        </form>
                    </div>
                </div>
            </div>
        </section>
    );
}

/* ════════════════════════════════════════════ FOOTER */
function Footer() {
    return (
        <footer className="lp-footer">
            <div className="lp-container lp-footer-inner">
                <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--lp-fg)' }}>
                    Track<span style={{ color: 'var(--lp-primary)' }}>Pro</span>
                </div>
                <div className="lp-footer-links">
                    {['Privacy', 'Terms', 'Docs', 'Status'].map(l => <a key={l} href="#" className="lp-footer-link">{l}</a>)}
                </div>
                <div className="lp-footer-copy">© {new Date().getFullYear()} TrackPro. All rights reserved.</div>
            </div>
        </footer>
    );
}

/* ════════════════════════════════════════════ ROOT */
export default function LandingPage() {
    useReveal();
    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: LP_CSS }} />
            <div className="lp-root">
                <Navbar />
                <HeroSection />
                <StatsSection />
                <HowItWorksSection />
                <FeaturesSection />
                <TestimonialsSection />
                <PricingSection />
                <FAQSection />
                <ContactSection />
                <Footer />
            </div>
        </>
    );
}