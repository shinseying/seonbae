import RouteSkeleton from "../RouteSkeleton";

export default function Loading() {
  return <RouteSkeleton label="결제 내역을 불러오는 중" variant="rows" stats rows={5} />;
}
