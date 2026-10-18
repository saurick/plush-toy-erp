import { useEffect } from 'react'
import { mountScrollEdges } from './scrollEdgeController.mjs'
import './scrollEdges.css'

export default function ScrollEdges() {
  useEffect(() => mountScrollEdges(), [])
  return null
}
