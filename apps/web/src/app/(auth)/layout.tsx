// Split screen from the prototype's log-in page: brand panel with the workbench photo left, form card right.
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="hidden flex-col justify-center bg-[linear-gradient(rgba(2,36,72,.8),rgba(2,36,72,.8)),url(/landing-bg.jpg)] bg-cover bg-center bg-no-repeat px-20 py-[60px] text-white lg:flex">
        <div className="text-base font-bold">BMERC</div>
        <h1 className="mb-3 mt-4 max-w-[620px] text-[40px] font-bold leading-[1.15]">Run your Bitcoin mining repair center from one place</h1>
        <p className="max-w-[520px] text-[17px] text-[#e6edf5]">Manage customers, sites, technicians, jobs and spare parts in a single platform.</p>
      </div>
      <div className="flex items-center justify-center p-10 max-sm:px-4">
        <div className="w-full max-w-[400px] rounded-xl bg-white p-8 shadow-[0_1px_2px_rgba(0,0,0,.05)]">
          <div className="mb-6 text-base font-bold text-navy lg:hidden">BMERC</div>
          {children}
        </div>
      </div>
    </div>
  );
}
