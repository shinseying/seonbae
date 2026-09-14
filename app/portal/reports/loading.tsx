import RouteSkeleton from "../RouteSkeleton";

export default function Loading() {
  return <RouteSkeleton label="리포트를 불러오는 중" variant="rows" stats rows={4} />;
}
