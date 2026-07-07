interface LowMediumHighIconProps {
  level?: 0 | 1 | 2 | 3 | 4;
}

export const LowMediumHighIcon: React.FC<LowMediumHighIconProps> = ({
  level = 1,
}) => {
  const bars = [1, 2, 3, 4] as const;

  return (
    <div className="flex items-end gap-0.5 ">
      {bars.map((bar) => (
        <div
          key={bar}
          className={`w-1 rounded-xs ${
            level >= bar
              ? "bg-muted-foreground"
              : "bg-transparent border border-muted-foreground"
          }`}
          style={{ height: `${bar * 0.25}rem` }}
        />
      ))}
    </div>
  );
};
