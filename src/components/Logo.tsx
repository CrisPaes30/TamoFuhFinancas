import logoUrl from "../assets/logoTf.png";

export default function Logo({ size = 100 }: { size?: number }) {
  return (
    <div className="flex items-center justify-center gap-3">
      <img
        src={logoUrl}
        alt="tamo fuuh"
        style={{ height: size, width: "auto" }} // aqui usa o prop size
      />
    </div>
  );
}
