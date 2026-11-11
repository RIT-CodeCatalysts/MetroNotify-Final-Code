function Button({
  children,
  className = "",
  type = "button",
  onClick,
  ...props
}) {
  return (
    <button
      type={type}
      className={className}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
}

export default Button;