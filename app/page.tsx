import Link from "next/link";
import SiteNav from "@/components/SiteNav";
import Footer from "@/components/Footer";
import ProductBrowser from "@/components/ProductBrowser";

export default function HomePage(){
 return <><SiteNav/><main><section className="hero"><div className="shell hero-grid"><div><div className="eyebrow">Everyday essentials. One trusted store.</div><h1>Good finds for<br/>every part of life.</h1><p>Explore fashion, footwear, home goods, furniture, building materials and more — with retail shopping and wholesale options from one growing Sierra Leonean store.</p><div className="hero-actions"><a className="btn" href="#shop">Explore products <span>→</span></a><Link className="btn secondary" href="/wholesale">Wholesale enquiries</Link></div></div><div className="hero-art"><div className="art-card"><div className="art-label">Welcome to Abi-Chris</div><strong>More choice. More value.</strong><p>From everyday fashion to practical home and building essentials.</p></div></div></div></section>
 <section className="shell benefits"><div className="benefit"><div className="benefit-icon">✦</div><div><strong>A wide-ranging catalogue</strong><span>Fashion, home, furniture, construction and more.</span></div></div><div className="benefit"><div className="benefit-icon">◇</div><div><strong>Retail & wholesale</strong><span>Retail prices for everyone, wholesale access by approval.</span></div></div><div className="benefit"><div className="benefit-icon">✓</div><div><strong>Helpful service</strong><span>Clear product information and a growing catalogue.</span></div></div></section>
 <section id="shop" className="section shell"><div className="section-head"><div><div className="eyebrow">Discover our range</div><h2>Shop the catalogue</h2><p>Products published by the store team appear here.</p></div></div><ProductBrowser/></section>
 <section className="shell"><div className="cta"><div><h2>Buying for your business?</h2><p>Request wholesale access to see approved wholesale prices and bulk offers.</p></div><Link className="btn" href="/wholesale">Explore wholesale access →</Link></div></section></main><Footer/></>
}
