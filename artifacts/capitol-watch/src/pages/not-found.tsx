import { Link } from "wouter";
import { ShieldAlert } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="max-w-md w-full p-8 text-center bg-card rounded-3xl border border-border shadow-xl">
        <ShieldAlert className="w-16 h-16 text-primary mx-auto mb-6" />
        <h1 className="text-4xl font-serif text-foreground mb-3">Page Not Found</h1>
        <p className="text-muted-foreground mb-8">
          The page you are looking for doesn't exist or has been moved.
        </p>
        <Link 
          href="/" 
          className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all"
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
