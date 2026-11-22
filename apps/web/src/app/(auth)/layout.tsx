// Split screen from the prototype's log-in page: brand panel left, form card right.
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="hidden flex-col justify-center bg-navy px-20 py-16 text-white lg:flex">
        <div className="text-base font-bold">BMERC</div>
        <h1 className="mt-4 max-w-xl text-4xl font-bold leading-tight">Run your Bitcoin mining repair center from one place</h1>
        <p className="mt-3 max-w-md text-lg text-[#e6edf5]">Customers, sites, technicians, jobs and spare parts in a single platform.</p>
      </div>
      <div className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-[400px] rounded-xl bg-white p-8 shadow-[0_1px_2px_rgba(0,0,0,.05)]">
          <div className="mb-6 text-base font-bold text-navy lg:hidden">BMERC</div>
          {children}
        </div>
      </div>
    </div>
  );
}
