type BrandProps = {
  asButton?: boolean;
  onClick?: () => void;
};

export function Brand({ asButton = false, onClick }: BrandProps) {
  const content = (
    <>
      <span className="brand-mark">L</span>
      <span>
        LEKIN <b>Lab</b>
      </span>
    </>
  );

  if (asButton) {
    return (
      <button className="brand brand-button" type="button" onClick={onClick}>
        {content}
      </button>
    );
  }

  return (
    <a className="brand" href="#" aria-label="LEKIN Lab home">
      {content}
    </a>
  );
}
