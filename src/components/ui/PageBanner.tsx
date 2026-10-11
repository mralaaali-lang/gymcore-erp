interface PageBannerProps {
  title: string;
  subtitle?: string;
}

export default function PageBanner({ title, subtitle }: PageBannerProps) {
  return (
    <div className="relative -mx-margin-mobile md:-mx-margin-desktop -mt-margin-mobile md:-mt-margin-desktop mb-stack-lg">
      <div className="bg-petrol px-margin-mobile md:px-margin-desktop py-8 md:py-10 rounded-b-[2.5rem] shadow-xl shadow-petrol/15">
        <h1 className="text-headline-lg md:text-headline-xl font-bold text-white tracking-tight">{title}</h1>
        {subtitle && (
          <p className="text-body-md text-petrol-muted mt-1.5 font-medium">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
